import Foundation

final class Wire: URLProtocol, @unchecked Sendable {
    private final class Storage: @unchecked Sendable {
        let lock = NSLock()
        var requests: [URLRequest] = []
        var payload = Data()
    }
    private static let storage = Storage()
    static var requests: [URLRequest] { storage.lock.withLock { storage.requests } }
    static func setPayload(_ payload: Data) { storage.lock.withLock { storage.payload = payload } }
    static func reset() { storage.lock.withLock { storage.requests = [] } }
    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func startLoading() {
        Self.storage.lock.withLock { Self.storage.requests.append(request) }
        let status: Int
        let data: Data
        if request.url?.host != "keyatlas.io" { status = 599; data = Data("{}".utf8) }
        else if request.httpMethod == "GET" {
            status = 200
            data = Self.storage.lock.withLock { Self.storage.payload }
        } else { status = 201; data = Data("{\"data\":{\"id\":\"saved\"}}".utf8) }
        let response = HTTPURLResponse(url: request.url!, statusCode: status, httpVersion: nil, headerFields: ["Content-Type": "application/json"])!
        client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: data)
        client?.urlProtocolDidFinishLoading(self)
    }
    override func stopLoading() {}
}

enum ForumTestTransport {
    static var session: URLSession {
        let config = URLSessionConfiguration.ephemeral
        config.protocolClasses = [Wire.self]
        return URLSession(configuration: config)
    }
}
