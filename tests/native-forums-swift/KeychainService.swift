import Foundation

// Test-only replacement, never compiled into the app. No Security/Keychain calls.
enum KeychainService {
    enum Key: String, Sendable { case authToken, sessionCookie }
    private final class Memory: @unchecked Sendable {
        let lock = NSLock()
        var values: [Key: String] = [:]
        var reads = 0
    }
    private static let memory = Memory()
    static func reset(token: String? = nil, cookie: String? = nil) {
        memory.lock.withLock {
            memory.values = [:]
            memory.values[.authToken] = token
            memory.values[.sessionCookie] = cookie
            memory.reads = 0
        }
    }
    static var readCount: Int { memory.lock.withLock { memory.reads } }
    static func load(_ key: Key) -> String? {
        memory.lock.withLock {
            memory.reads += 1
            return memory.values[key]
        }
    }
    static func save(_ value: String, for key: Key) throws {
        memory.lock.withLock { memory.values[key] = value }
    }
}
