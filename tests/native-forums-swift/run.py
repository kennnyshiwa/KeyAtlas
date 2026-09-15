#!/usr/bin/env python3
"""Compile pinned shipped Swift code; intercept all HTTP and use memory-only credentials.
Usage: python3 tests/native-forums-swift/run.py IOS_CHECKOUT NEW_OUTPUT_DIR DETAIL_JSON
DETAIL_JSON is emitted by native-forums.integration.test.ts via FORUM_CONTRACT_OUTPUT.
"""
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import sys

here = Path(__file__).resolve().parent
ios, out, detail = (Path(arg).resolve() for arg in sys.argv[1:4])
revision = '989d0545ee6eb8013f56ab0ffe080488855803a7'
out.mkdir(parents=True, exist_ok=False)
(out / 'Sources').mkdir()
(out / 'Tests').mkdir()
hashes = {}
def shipped(path):
    data = subprocess.check_output(['git', '-C', str(ios), 'show', f'{revision}:Sources/KeyAtlas/{path}'])
    hashes[path] = hashlib.sha256(data).hexdigest()
    return data
for path in ['Services/APIClient.swift', 'ViewModels/ForumViewModel.swift', 'Models/Forum.swift', 'Models/Guide.swift', 'Models/User.swift', 'Models/Project.swift', 'Models/Notification.swift', 'Models/Vendor.swift', 'Models/Designer.swift', 'Extensions/String+Display.swift']:
    data = shipped(path)
    if path == 'Services/APIClient.swift':
        # Harness-only dependency wiring: use the production session injection seam.
        # APIClient methods and all ViewModel code remain byte-for-byte unchanged.
        data = data.replace(b'static let shared = APIClient()', b'static let shared = APIClient(session: ForumTestTransport.session)')
    (out / 'Sources' / Path(path).name).write_bytes(data)
# The SwiftUI sheet's exact production method, in a state-only shell so it can run on macOS.
# No edits to the method/body/path/default auth call; only the UI surrounding it is replaced.
view = shipped('Views/Forums/ThreadListView.swift').decode()
method = view[view.index('    private func createThread() async {'):view.rfind('\n}')]
(out / 'Sources/CreateHarness.swift').write_text('''import Foundation
final class CreateHarness: @unchecked Sendable {
    let categoryId: String
    var title = "Swift native title"
    var content = "Swift native content"
    var isPosting = false
    var error: String?
    var created = false
    init(categoryId: String) { self.categoryId = categoryId }
    func onCreated() { created = true }
    func dismiss() {}
    func run() async { await createThread() }
''' + method + '\n}\n')
shutil.copy2(here / 'Transport.swift', out / 'Sources/Transport.swift')
shutil.copy2(here / 'KeychainService.swift', out / 'Sources/KeychainService.swift')
shutil.copy2(here / 'ContractTests.swift', out / 'Tests/ContractTests.swift')
shutil.copy2(detail, out / 'Tests/detail-response.json')
(out / 'production-source-sha256.json').write_text(json.dumps({'revision': revision, 'sha256': hashes, 'harness_wiring': 'APIClient.shared uses existing init(session:) with ephemeral URLProtocol-only session; production method bodies unchanged. NewThreadView method extracted into state shell.'}, indent=2) + '\n')
(out / 'Package.swift').write_text('''// swift-tools-version: 6.0
import PackageDescription
let package = Package(name: "ForumContract", platforms: [.macOS(.v14)], targets: [
 .target(name: "ForumContract", path: "Sources"),
 .testTarget(name: "ForumContractTests", dependencies: ["ForumContract"], path: "Tests", resources: [.copy("detail-response.json")])
])
''')
sys.exit(subprocess.run(['swift', 'test', '--package-path', str(out)]).returncode)
