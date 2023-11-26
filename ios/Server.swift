//
//  Server.swift
//  LutiMcMurdo
//
//  Created by M Biddulph on 11/26/23.
//

import Foundation
import Swifter
import React

@objc class Server: NSObject {
  @objc static let instance = Server()
  @objc var url: URL?
  
  let server = HttpServer()
  @objc func start() {
    server["/desktop/:path"] = shareFilesFromDirectory("/Users/me/Desktop")
    server["/"] = { request in
        return HttpResponse.ok(.text("<html><body><b>hello</b></body></html>"))
    }
    try! server.start()
    self.url = URL(string: "http://localhost:\(try! server.port())")!
  }
}
