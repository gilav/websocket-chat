"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const chat_server_1 = require("./chat-server");
const routes_1 = require("./routes/routes");
let app = new chat_server_1.ChatServer().getApp();
exports.app = app;
const route = new routes_1.Routes(app);
route.getRoutes();
//# sourceMappingURL=server.js.map