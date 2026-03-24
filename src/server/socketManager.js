/**
 * server/socketManager.js   (or src/socket/socketManager.js)
 *
 * Central module for Socket.io server setup.
 *
 * HOW IT WORKS:
 *  1. initSocket(httpServer) is called once in server.js at startup.
 *  2. The io instance is stored in module scope.
 *  3. Any backend service can call getIO() to emit events.
 *  4. Clients connect and emit "join" with their userId.
 *     The server puts the socket into a room named after that userId.
 *  5. When the server wants to push an event to a specific user it does:
 *       getIO().to(userId).emit("eventName", payload);
 */
import { Server } from "socket.io";

let io = null;

/**
 * Boot Socket.io and attach it to the HTTP server.
 * Call this once, right after creating the httpServer.
 */
export const initSocket = (httpServer) => {
  io = new Server(httpServer, {
    cors: {
      origin: process.env.CLIENT_URL ?? "http://localhost:5173",
      methods: ["GET", "POST"],
      credentials: true,
    },
    // Drop to polling only if websocket fails (useful behind some proxies)
    transports: ["websocket", "polling"],
  });

  io.on("connection", (socket) => {
    console.info(`[Socket] connected: ${socket.id}`);

    /**
     * "join" — client emits this immediately after connecting.
     * payload: userId (string)
     * We join the socket into a room named after the userId.
     * Every emit to that room reaches all tabs/devices of that user.
     */
    socket.on("join", (userId) => {
      if (!userId) return;
      socket.join(String(userId)); // room = userId string
      console.info(`[Socket] ${socket.id} joined room: ${userId}`);
    });

    socket.on("disconnect", (reason) => {
      console.info(`[Socket] disconnected: ${socket.id} — ${reason}`);
    });
  });

  return io;
};

/** Returns the io instance. Throws if initSocket() was not called yet. */
export const getIO = () => {
  if (!io)
    throw new Error("Socket.io not initialised — call initSocket() first");
  return io;
};

/**
 * Emit an event to ONE user's personal room.
 *
 * @param {string}  userId  Target user's MongoDB _id (as string)
 * @param {string}  event   Event name (e.g. "notificationTriggered")
 * @param {object}  payload Data to send
 */
export const emitToUser = (userId, event, payload) => {
  if (!io || !userId) return;
  io.to(String(userId)).emit(event, payload);
};

/**
 * Emit an event to every member of a group simultaneously.
 *
 * @param {string[]} userIds Array of MongoDB _id strings
 * @param {string}   event   Event name
 * @param {object}   payload Data to send
 */
export const emitToUsers = (userIds, event, payload) => {
  if (!io || !userIds?.length) return;
  for (const uid of userIds) {
    io.to(String(uid)).emit(event, payload);
  }
};
