import Foundation
import Testing
@testable import ForumContract

@Suite(.serialized)
struct NativeForumContractTests {
    @Test func shippedCreateDetailReplyContract() async throws {
        KeychainService.reset(token: "kv_test_only", cookie: "session=test-only")
        Wire.reset()
        let payload = try Data(contentsOf: Bundle.module.url(forResource: "detail-response", withExtension: "json")!)
        Wire.setPayload(payload)
        let original = try JSONDecoder().decode(APIDataResponse<ForumThread>.self, from: payload).data
        #expect(original.categoryId != nil)
        #expect(original.createdAt.isEmpty == false)
        #expect(original.postCount == 1)
        #expect(original.isLocked == false)
        #expect(original.posts?.first?.createdAt.isEmpty == false)
        #expect(original.posts?.first?.threadId == original.id)
        #expect(original.author?.role == nil)
        #expect(original.author?.name == "Public fixture")

        // Executes the shipped NewThreadView.createThread method, not a reimplementation.
        let creator = CreateHarness(categoryId: original.categoryId!)
        await creator.run()
        #expect(creator.error == nil)
        #expect(creator.created)
        let create = try #require(Wire.requests.first)
        #expect(create.url?.path == "/api/v1/forums/threads")
        #expect(create.httpMethod == "POST")
        #expect(create.value(forHTTPHeaderField: "Authorization") == "Bearer kv_test_only")
        #expect(create.value(forHTTPHeaderField: "Cookie") == "session=test-only")
        let body = try requestBody(create)
        let object = try #require(JSONSerialization.jsonObject(with: body) as? [String: String])
        #expect(object == ["title": "Swift native title", "content": "Swift native content", "category_id": original.categoryId!])

        // Unmodified shipped ViewModel + APIClient singleton; URLProtocol catches every request.
        let viewModel = ThreadDetailViewModel()
        await viewModel.loadThread(id: original.id)
        #expect(viewModel.error == nil)
        #expect(viewModel.thread?.id == original.id)
        let get = Wire.requests[1]
        #expect(get.httpMethod == "GET")
        #expect(get.url?.path == "/api/v1/forums/threads/\(original.id)")
        #expect(get.value(forHTTPHeaderField: "Authorization") == nil)
        #expect(get.value(forHTTPHeaderField: "Cookie") == nil)
        viewModel.replyText = "Swift reply"
        await viewModel.postReply()
        #expect(viewModel.error == nil)
        #expect(viewModel.replyText.isEmpty)
        #expect(Wire.requests.count == 4)
        let reply = Wire.requests[2]
        #expect(reply.url?.path == "/api/v1/forums/threads/\(original.id)/posts")
        #expect(reply.httpMethod == "POST")
        #expect(reply.value(forHTTPHeaderField: "Authorization") == "Bearer kv_test_only")
        #expect(reply.value(forHTTPHeaderField: "Cookie") == "session=test-only")
        let replyBody = try requestBody(reply)
        #expect(try JSONSerialization.jsonObject(with: replyBody) as? [String: String] == ["content": "Swift reply"])
        #expect(Wire.requests[3].httpMethod == "GET")
        #expect(viewModel.thread?.posts?.count == 1)
    }
}

private func requestBody(_ request: URLRequest) throws -> Data {
    if let body = request.httpBody { return body }
    let stream = try #require(request.httpBodyStream)
    stream.open(); defer { stream.close() }
    var result = Data()
    var bytes = [UInt8](repeating: 0, count: 4096)
    while stream.hasBytesAvailable {
        let count = stream.read(&bytes, maxLength: bytes.count)
        if count <= 0 { break }
        result.append(contentsOf: bytes.prefix(count))
    }
    return result
}
