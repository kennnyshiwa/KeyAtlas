#!/usr/bin/env python3
"""Compile exact shipped models/APIClient, with only transport/keychain test doubles.
Usage: python3 tests/related-projects-swift/run.py IOS_CHECKOUT NEW_OUTPUT_DIR ROUTE_JSON
No checkout changes, network requests, keychain access, or dependency downloads.
"""
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import sys

here = Path(__file__).resolve().parent
ios, out, response = (Path(arg).resolve() for arg in sys.argv[1:4])
revision = "989d0545ee6eb8013f56ab0ffe080488855803a7"
out.mkdir(parents=True, exist_ok=False)
(out / "Sources").mkdir()
(out / "Tests").mkdir()
hashes = {}
for path in ["Services/APIClient.swift", "Models/Project.swift", "Models/User.swift", "Models/Vendor.swift", "Models/Designer.swift", "Extensions/String+Display.swift"]:
    data = subprocess.check_output(["git", "-C", str(ios), "show", f"{revision}:Sources/KeyAtlas/{path}"])
    hashes[path] = hashlib.sha256(data).hexdigest()
    (out / "Sources" / Path(path).name).write_bytes(data)
# Reuse existing memory-only keychain and all-HTTP-intercepting URLProtocol harness.
# APIClient itself is byte-for-byte unchanged and uses its existing init(session:).
for name in ["KeychainService.swift", "Transport.swift"]:
    shutil.copy2(here.parent / "native-forums-swift" / name, out / "Sources" / name)
shutil.copy2(here / "ContractTests.swift", out / "Tests/ContractTests.swift")
shutil.copy2(response, out / "Tests/route-response.json")
(out / "production-source-sha256.json").write_text(json.dumps({
    "revision": revision, "sha256": hashes,
    "route_response_sha256": hashlib.sha256(response.read_bytes()).hexdigest(),
    "modifications_to_shipped_sources": [],
}, indent=2) + "\n")
(out / "Package.swift").write_text('''// swift-tools-version: 6.0
import PackageDescription
let package = Package(name: "RelatedContract", platforms: [.macOS(.v14)], targets: [
 .target(name: "RelatedContract", path: "Sources"),
 .testTarget(name: "RelatedContractTests", dependencies: ["RelatedContract"], path: "Tests", resources: [.copy("route-response.json")])
])
''')
sys.exit(subprocess.run(["swift", "test", "--package-path", str(out), "--cache-path", str(out / ".cache"), "--config-path", str(out / ".config"), "--security-path", str(out / ".security")]).returncode)
