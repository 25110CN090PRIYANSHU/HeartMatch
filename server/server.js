const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const path = require("path");
const http = require("http");
const { Server } = require("socket.io");
const jwt = require("jsonwebtoken");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");

require("dotenv").config();

const authRoutes = require("./routes/authRoutes");
const profileRoutes = require("./routes/profileRoutes");
const discoverRoutes = require("./routes/discoverRoutes");
const notificationRoutes = require("./routes/notificationRoutes");
const likeRoutes = require("./routes/likeRoutes");
const matchRoutes = require("./routes/matchRoutes");
const chatRoutes = require("./routes/chatRoutes");
const blockRoutes = require("./routes/blockRoutes");
const reportRoutes = require("./routes/reportRoutes");
const adminRoutes = require("./routes/adminRoutes");
const authMiddleware = require("./middleware/authMiddleware");

const Message = require("./models/Message");
const Like = require("./models/Like");
const Notification = require("./models/Notification");
const User = require("./models/User");
const Block = require("./models/Block");

const app = express();

app.use(
    helmet({
        crossOriginResourcePolicy: false,
        contentSecurityPolicy: false
    })
);
app.use(cors());
app.use(express.json({ limit: "1mb" }));

const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 50, standardHeaders: "draft-8", legacyHeaders: false });
app.use("/api/auth/login", authLimiter);
app.use("/api/auth/signup", authLimiter);
app.use("/api/auth/forgot-password", authLimiter);

// ===============================
// SERVE FRONTEND
// ===============================

app.use(express.static(path.join(__dirname, "../client")));
app.use("/uploads", express.static(path.join(__dirname, "uploads"), { maxAge: "1d" }));

app.get("/", (req, res) => {
    res.sendFile(
        path.join(__dirname, "../client/index.html")
    );
});

// ===============================
// HTTP SERVER
// ===============================

const server = http.createServer(app);

// ===============================
// SOCKET.IO
// ===============================

const io = new Server(server, {
    maxHttpBufferSize: 8e6,
    cors: {
        origin: "*"
    }
});

// ===============================
// API ROUTES
// ===============================

app.use("/api/auth", authRoutes);

app.use("/api/profile", profileRoutes);

app.use("/api/discover", discoverRoutes);

app.use("/api/notifications", notificationRoutes);

// Pass Socket.IO to like routes
app.use("/api/likes", likeRoutes(io));

app.use("/api/matches", matchRoutes);

app.use("/api/chat", chatRoutes);

// ===============================
// WEBRTC TURN CONFIG
// ===============================
// TURN credentials are stored in Render Environment Variables.
// They are NOT stored in GitHub or exposed in your source code.

app.get("/api/turn-config", (req, res) => {
    try {
        const urls = (process.env.TURN_URLS || "")
            .split(",")
            .map(url => url.trim())
            .filter(Boolean);

        // Always include Google STUN servers
        const iceServers = [
            {
                urls: "stun:stun.l.google.com:19302"
            },
            {
                urls: "stun:stun1.l.google.com:19302"
            }
        ];

        // Add TURN only when all required credentials exist
        if (
            urls.length > 0 &&
            process.env.TURN_USERNAME &&
            process.env.TURN_CREDENTIAL
        ) {
            iceServers.push({
                urls: urls,
                username: process.env.TURN_USERNAME,
                credential: process.env.TURN_CREDENTIAL
            });
        }

        res.json({
            success: true,
            iceServers: iceServers
        });

    } catch (error) {

        console.error(
            "TURN config error:",
            error
        );

        res.status(500).json({
            success: false,
            message: "Unable to load WebRTC configuration"
        });
    }
});

// Public profile endpoint for a matched person's profile page.
app.get("/api/person/:id", authMiddleware, async (req, res) => {
    try {
        const id = req.params.id;
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ message: "Invalid user ID" });
        }
        if (await Block.exists({
            $or: [
                { blocker: req.userId, blocked: id },
                { blocker: id, blocked: req.userId }
            ]
        })) {
            return res.status(403).json({ message: "This user is unavailable" });
        }
        const user = await User.findById(id).select("name age gender location bio interests profileImage uniqueId");
        if (!user) return res.status(404).json({ message: "User not found" });
        res.json({ success: true, user });
    } catch (error) {
        console.error("Person profile error:", error);
        res.status(500).json({ message: "Server error" });
    }
});
app.use("/api/blocks", blockRoutes);
app.use("/api/reports", reportRoutes);
app.use("/api/admin", adminRoutes);

// Keep API failures JSON-shaped, including async route and upload errors.
app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    if (error?.code === "LIMIT_FILE_SIZE") {
        return res.status(413).json({ message: "Uploaded file must be under 5MB" });
    }
    if (error?.code === "LIMIT_UNEXPECTED_FILE" || error?.name === "MulterError") {
        return res.status(400).json({ message: "Invalid file upload" });
    }
    if (error?.type === "entity.too.large") {
        return res.status(413).json({ message: "Request body is too large" });
    }
    console.error("Unhandled request error:", error);
    return res.status(500).json({ message: "Server error" });
});


// ==================================================
// ONLINE USERS
// ==================================================

// Map:
// userId -> number of active socket connections
//
// Example:
// {
//     "abc123": 1,
//     "xyz456": 2
// }
//
// If a user has 2 browser tabs open,
// they will have 2 socket connections.

const onlineUsers = new Map();


// ===============================
// ADD USER ONLINE
// ===============================

function addOnlineUser(userId) {

    const currentConnections =
        onlineUsers.get(userId) || 0;

    onlineUsers.set(
        userId,
        currentConnections + 1
    );

    // Only announce when the user
    // becomes online for the first time.

    if (currentConnections === 0) {

        console.log(
            "User is now ONLINE:",
            userId
        );

        io.emit(
            "userOnline",
            userId
        );
    }
}


// ===============================
// REMOVE USER ONLINE
// ===============================

function removeOnlineUser(userId) {

    const currentConnections =
        onlineUsers.get(userId) || 0;

    // No connection found
    if (currentConnections <= 1) {

        onlineUsers.delete(userId);

        console.log(
            "User is now OFFLINE:",
            userId
        );

        io.emit(
            "userOffline",
            userId
        );

    } else {

        // User still has another tab/device open
        onlineUsers.set(
            userId,
            currentConnections - 1
        );
    }
}


// ===============================
// CHECK ONLINE STATUS
// ===============================

function isUserOnline(userId) {

    return onlineUsers.has(
        userId.toString()
    );
}

async function usersBlocked(firstUserId, secondUserId) {
    return !!(await Block.exists({
        $or: [
            { blocker: firstUserId, blocked: secondUserId },
            { blocker: secondUserId, blocked: firstUserId }
        ]
    }));
}


// ==================================================
// SOCKET AUTHENTICATION
// ==================================================

io.use((socket, next) => {

    try {

        const token =
            socket.handshake.auth.token;

        if (!token) {

            return next(
                new Error(
                    "Authentication required"
                )
            );
        }

        const decoded =
            jwt.verify(
                token,
                process.env.JWT_SECRET
            );

        if (!mongoose.Types.ObjectId.isValid(decoded.userId)) {
            return next(new Error("Invalid or expired token"));
        }

        User.exists({ _id: decoded.userId, isActive: true })
            .then((userExists) => {
                if (!userExists) return next(new Error("Account is unavailable"));
                socket.userId = decoded.userId.toString();
                next();
            })
            .catch(() => next(new Error("Authentication failed")));

    } catch (error) {

        next(
            new Error(
                "Invalid or expired token"
            )
        );
    }

});


// ==================================================
// SOCKET CONNECTION
// ==================================================

io.on("connection", (socket) => {

    console.log(
        "User connected:",
        socket.userId
    );


    // ===============================
    // PERSONAL ROOM
    // ===============================

    socket.join(
        socket.userId
    );


    // ===============================
    // MARK USER ONLINE
    // ===============================

    addOnlineUser(
        socket.userId
    );


    // ==================================================
    // DELIVER PENDING MESSAGES
    // ==================================================
    // If this user was offline when someone sent a message,
    // mark those messages delivered as soon as the user
    // establishes a Socket.IO connection.
    (async () => {
        try {
            const pending = await Message.find({
                receiver: socket.userId,
                delivered: false
            }).select("_id sender");

            if (!pending.length) return;

            const deliveredAt = new Date();

            await Message.updateMany(
                {
                    receiver: socket.userId,
                    delivered: false
                },
                {
                    $set: {
                        delivered: true,
                        deliveredAt
                    }
                }
            );

            for (const item of pending) {
                io.to(item.sender.toString()).emit(
                    "messageDelivered",
                    {
                        messageId: item._id.toString(),
                        deliveredAt
                    }
                );
            }
        } catch (error) {
            console.error("Pending delivery status error:", error);
        }
    })();


    // ==================================================
    // CHECK ANOTHER USER'S ONLINE STATUS
    // ==================================================

    socket.on(
        "checkUserOnline",
        (data, callback) => {

            try {

                const userId =
                    data?.userId;

                if (!userId) {

                    return callback({
                        success: false,
                        message:
                            "User ID is required"
                    });
                }


                if (
                    !mongoose.Types.ObjectId
                        .isValid(userId)
                ) {

                    return callback({
                        success: false,
                        message:
                            "Invalid user ID"
                    });
                }


                const online =
                    isUserOnline(userId);


                callback({

                    success: true,

                    online: online

                });

            } catch (error) {

                console.error(
                    "Online status error:",
                    error
                );

                callback({

                    success: false,

                    message:
                        "Failed to check online status"

                });
            }

        }
    );


    // ==================================================
// TYPING INDICATOR
// ==================================================

socket.on("typing", (data) => {
    try {
        const receiver = data?.receiver;

        if (!receiver) return;

        if (!mongoose.Types.ObjectId.isValid(receiver)) {
            return;
        }

        io.to(receiver).emit("userTyping", {
            userId: socket.userId
        });

    } catch (error) {
        console.error("Typing error:", error);
    }
});


// ==================================================
// STOP TYPING
// ==================================================

socket.on("stopTyping", (data) => {
    try {
        const receiver = data?.receiver;

        if (!receiver) return;

        if (!mongoose.Types.ObjectId.isValid(receiver)) {
            return;
        }

        io.to(receiver).emit("userStoppedTyping", {
            userId: socket.userId
        });

    } catch (error) {
        console.error("Stop typing error:", error);
    }
});
    // ==================================================
    // SEND MESSAGE
    // ==================================================

    socket.on(
        "sendMessage",
        async (data, callback) => {

            // Prevent error if callback
            // wasn't provided.

            const respond =
                typeof callback === "function"
                    ? callback
                    : () => {};


            try {

                const {
                    receiver,
                    content
                } = data || {};


                // ===============================
                // VALIDATE MESSAGE
                // ===============================

                if (
                    !receiver ||
                    !content ||
                    !content.trim()
                ) {

                    return respond({

                        success: false,

                        message:
                            "Message cannot be empty"

                    });
                }


                // ===============================
                // VALIDATE RECEIVER ID
                // ===============================

                if (
                    !mongoose.Types.ObjectId
                        .isValid(receiver)
                ) {

                    return respond({

                        success: false,

                        message:
                            "Invalid receiver"

                    });
                }

                if (await usersBlocked(socket.userId, receiver)) {
                    return respond({
                        success: false,
                        message: "You cannot message this user"
                    });
                }


                // ===============================
                // CHECK MUTUAL MATCH
                // ===============================

                const [
                    myLike,
                    theirLike
                ] = await Promise.all([

                    Like.exists({

                        from:
                            socket.userId,

                        to:
                            receiver,

                        type:
                            "like"

                    }),

                    Like.exists({

                        from:
                            receiver,

                        to:
                            socket.userId,

                        type:
                            "like"

                    })

                ]);


                if (!myLike || !theirLike) {

                    return respond({

                        success: false,

                        message:
                            "You can only message your matches"

                    });
                }


                // ===============================
                // CREATE MESSAGE
                // ===============================

                let message =
                    await Message.create({

                        sender:
                            socket.userId,

                        receiver:
                            receiver,

                        content:
                            content.trim(),

                        delivered: false,
                        deliveredAt: null,
                        read: false,
                        readAt: null

                    });

                // A message is considered delivered when at least one
                // active Socket.IO connection exists for the receiver.
                // This gives us the WhatsApp-style second tick without
                // pretending the message was seen.
                if (isUserOnline(receiver)) {
                    message = await Message.findByIdAndUpdate(
                        message._id,
                        {
                            $set: {
                                delivered: true,
                                deliveredAt: new Date()
                            }
                        },
                        { new: true }
                    );
                }


                // ===============================
                // GET SENDER INFORMATION
                // ===============================

                const sender =
                    await User.findById(
                        socket.userId
                    )
                    .select(
                        "name profileImage"
                    );


                if (!sender) {

                    return respond({

                        success: false,

                        message:
                            "Sender not found"

                    });
                }


                // ===============================
                // CREATE NOTIFICATION
                // ===============================

                const notification =
                    await Notification.create({

                        recipient:
                            receiver,

                        sender:
                            socket.userId,

                        type:
                            "message",

                        title:
                            "New message 💬",

                        message:
                            `${sender.name} sent you a message`

                    });


                // ===============================
                // SEND MESSAGE TO RECEIVER
                // ===============================

                io.to(receiver).emit(
                    "newMessage",
                    message
                );


                // ===============================
                // SEND NOTIFICATION
                // ===============================

                io.to(receiver).emit(
                    "newNotification",
                    notification
                );


                // ===============================
                // SEND MESSAGE BACK TO SENDER
                // ===============================

                io.to(socket.userId).emit(
                    "messageSent",
                    message
                );


                // ===============================
                // SUCCESS CALLBACK
                // ===============================

                respond({

                    success: true,

                    message:
                        message

                });


            } catch (error) {

                console.error(
                    "Message error:",
                    error
                );


                respond({

                    success: false,

                    message:
                        "Failed to send message"

                });

            }

        }
    );


    // ==================================================
    // SEND ATTACHMENT
    // ==================================================
    socket.on("sendAttachment", async (data, callback) => {
        const respond = typeof callback === "function" ? callback : () => {};
        try {
            const receiver = data?.receiver;
            const a = data?.attachment;
            if (!receiver || !a?.data || !a?.name || !mongoose.Types.ObjectId.isValid(receiver)) {
                return respond({success:false,message:"Invalid attachment"});
            }
            if (await usersBlocked(socket.userId, receiver)) {
                return respond({success:false,message:"You cannot message this user"});
            }
            const [myLike,theirLike] = await Promise.all([
                Like.exists({from:socket.userId,to:receiver,type:"like"}),
                Like.exists({from:receiver,to:socket.userId,type:"like"})
            ]);
            if (!myLike || !theirLike) return respond({success:false,message:"You can only message your matches"});
            const payload = JSON.stringify({
                kind: a.kind === "image" || a.kind === "video" ? a.kind : "file",
                name: String(a.name).slice(0,180),
                type: String(a.type || "application/octet-stream").slice(0,120),
                data: String(a.data)
            });
            if (payload.length > 6500000) return respond({success:false,message:"Attachment is too large"});
            let message = await Message.create({
                sender: socket.userId,
                receiver,
                content: "__HM_ATTACHMENT__" + payload,
                delivered: false,
                deliveredAt: null,
                read: false,
                readAt: null
            });

            if (isUserOnline(receiver)) {
                message = await Message.findByIdAndUpdate(
                    message._id,
                    { $set: { delivered: true, deliveredAt: new Date() } },
                    { new: true }
                );
            }

            const sender = await User.findById(socket.userId).select("name");
            const notification = await Notification.create({recipient:receiver,sender:socket.userId,type:"message",title:"New attachment 📎",message:`${sender?.name || "Someone"} sent you an attachment`});
            io.to(receiver).emit("newMessage",message);
            io.to(receiver).emit("newNotification",notification);
            io.to(socket.userId).emit("messageSent",message);
            respond({success:true,message});
        } catch (error) {
            console.error("Attachment error:",error);
            respond({success:false,message:"Failed to send attachment"});
        }
    });

    // ==================================================
    // WEBRTC CALL SIGNALING
    // ==================================================
    async function callAllowed(to) {
        if (!to || !mongoose.Types.ObjectId.isValid(to)) return false;
        if (await usersBlocked(socket.userId, to)) return false;
        const [a,b] = await Promise.all([
            Like.exists({from:socket.userId,to,type:"like"}),
            Like.exists({from:to,to:socket.userId,type:"like"})
        ]);
        return !!(a && b);
    }
    // ==================================================
// WEBRTC SIGNALING
// Keep signaling messages in order.
// This prevents ICE candidates from overtaking
// the call offer/answer.
// ==================================================

const signalingQueues = new Map();

function queueSignal(socketId, task) {
    const previous =
        signalingQueues.get(socketId) || Promise.resolve();

    const next = previous
        .then(() => task())
        .catch((error) => {
            console.error("WebRTC signaling error:", error);
        });

    signalingQueues.set(socketId, next);

    // Remove completed queue when nothing newer
    // has replaced it.
    next.finally(() => {
        if (signalingQueues.get(socketId) === next) {
            signalingQueues.delete(socketId);
        }
    });

    return next;
}


// --------------------------------------------------
// CALL OFFER
// --------------------------------------------------

socket.on("callOffer", (d) => {
    queueSignal(socket.id, async () => {

        if (!(await callAllowed(d?.to))) {
            return;
        }

        if (!d?.to || !d?.offer) {
            return;
        }

        console.log(
            "📞 Forwarding CALL OFFER:",
            socket.userId,
            "→",
            d.to
        );

        io.to(d.to).emit("callOffer", {
            from: socket.userId,
            offer: d.offer,
            mode:
                d.mode === "audio"
                    ? "audio"
                    : "video"
        });
    });
});


// --------------------------------------------------
// CALL ANSWER
// --------------------------------------------------

socket.on("callAnswer", (d) => {
    queueSignal(socket.id, async () => {

        if (!(await callAllowed(d?.to))) {
            return;
        }

        if (!d?.to || !d?.answer) {
            return;
        }

        console.log(
            "📞 Forwarding CALL ANSWER:",
            socket.userId,
            "→",
            d.to
        );

        io.to(d.to).emit("callAnswer", {
            from: socket.userId,
            answer: d.answer
        });
    });
});


// --------------------------------------------------
// ICE CANDIDATE
// --------------------------------------------------

socket.on("callIce", (d) => {
    queueSignal(socket.id, async () => {

        if (!(await callAllowed(d?.to))) {
            return;
        }

        if (!d?.to || !d?.candidate) {
            return;
        }

        console.log(
            "🧊 Forwarding ICE:",
            socket.userId,
            "→",
            d.to
        );

        io.to(d.to).emit("callIce", {
            from: socket.userId,
            candidate: d.candidate
        });
    });
});


// --------------------------------------------------
// CALL REJECT
// --------------------------------------------------

socket.on("callReject", (d) => {
    queueSignal(socket.id, async () => {

        if (!(await callAllowed(d?.to))) {
            return;
        }

        if (!d?.to) {
            return;
        }

        console.log(
            "📵 Forwarding CALL REJECT:",
            socket.userId,
            "→",
            d.to
        );

        io.to(d.to).emit("callReject", {
            from: socket.userId
        });
    });
});


// --------------------------------------------------
// CALL END
// --------------------------------------------------

socket.on("callEnd", (d) => {
    queueSignal(socket.id, async () => {

        if (!(await callAllowed(d?.to))) {
            return;
        }

        if (!d?.to) {
            return;
        }

        console.log(
            "📴 Forwarding CALL END:",
            socket.userId,
            "→",
            d.to
        );

        io.to(d.to).emit("callEnd", {
            from: socket.userId
        });
    });
});

    // ==================================================
    // UNSEND MESSAGE (sender only, removed for both users)
    // ==================================================
    socket.on("unsendMessage", async (data, callback) => {
        const respond = typeof callback === "function" ? callback : () => {};
        try {
            const messageId = data?.messageId;
            if (!messageId || !mongoose.Types.ObjectId.isValid(messageId)) {
                return respond({ success: false, message: "Invalid message" });
            }
            const message = await Message.findById(messageId).select("sender receiver");
            if (!message) {
                return respond({ success: false, message: "Message not found" });
            }
            if (message.sender.toString() !== socket.userId.toString()) {
                return respond({ success: false, message: "You can only unsend your own messages" });
            }
            await Message.deleteOne({ _id: messageId });
            const payload = {
                messageId: messageId.toString(),
                sender: message.sender.toString(),
                receiver: message.receiver.toString()
            };
            io.to(payload.receiver).emit("messageUnsent", payload);
            io.to(payload.sender).emit("messageUnsent", payload);
            respond({ success: true, messageId: payload.messageId });
        } catch (error) {
            console.error("Unsend message error:", error);
            respond({ success: false, message: "Failed to unsend message" });
        }
    });

    // ==================================================
    // MARK MESSAGES AS READ
    // ==================================================

    socket.on(
        "markMessagesRead",
        async (data, callback) => {

            const respond =
                typeof callback === "function"
                    ? callback
                    : () => {};

            try {

                const otherUserId = data?.userId;

                if (!otherUserId) {
                    return respond({
                        success: false,
                        message: "User ID is required"
                    });
                }

                if (!mongoose.Types.ObjectId.isValid(otherUserId)) {
                    return respond({
                        success: false,
                        message: "Invalid user ID"
                    });
                }

                if (otherUserId.toString() === socket.userId.toString()) {
                    return respond({
                        success: false,
                        message: "Invalid conversation"
                    });
                }

                const [myLike, theirLike] = await Promise.all([
                    Like.exists({
                        from: socket.userId,
                        to: otherUserId,
                        type: "like"
                    }),
                    Like.exists({
                        from: otherUserId,
                        to: socket.userId,
                        type: "like"
                    })
                ]);

                if (!myLike || !theirLike) {
                    return respond({
                        success: false,
                        message: "You can only use read receipts with your matches"
                    });
                }

                const messagesToRead = await Message.find({
                    sender: otherUserId,
                    receiver: socket.userId,
                    read: false
                }).select("_id");

                const readAt = new Date();

                const result = await Message.updateMany(
                    {
                        sender: otherUserId,
                        receiver: socket.userId,
                        read: false
                    },
                    {
                        $set: {
                            delivered: true,
                            deliveredAt: readAt,
                            read: true,
                            readAt
                        }
                    }
                );

                const messageIds = messagesToRead.map((item) => item._id.toString());

                // Tell the sender exactly which messages became seen.
                if (messageIds.length > 0) {
                    io.to(otherUserId.toString()).emit(
                        "messagesRead",
                        {
                            readerId: socket.userId.toString(),
                            conversationWith: otherUserId.toString(),
                            messageIds,
                            count: result.modifiedCount
                        }
                    );
                }

                respond({
                    success: true,
                    count: result.modifiedCount
                });

            } catch (error) {

                console.error(
                    "Mark messages read error:",
                    error
                );

                respond({
                    success: false,
                    message: "Failed to mark messages as read"
                });
            }
        }
    );


    // ==================================================
    // DISCONNECT
    // ==================================================

    socket.on(
        "disconnect",
        () => {

            console.log(
                "User disconnected:",
                socket.userId
            );


            // Remove this socket
            // from online tracking.

            removeOnlineUser(
                socket.userId
            );

        }
    );

});


// ==================================================
// MONGODB CONNECTION
// ==================================================

mongoose.connect(
    process.env.MONGO_URI,
    {
        dbName: "HeartMatch"
    }
)

.then(async () => {

    console.log(
        "MongoDB connected successfully ✅"
    );

    console.log(
        "Database:",
        mongoose.connection.name
    );

    // Backfill public HeartMatch IDs for accounts created before the ID feature.
    // The User model generates a collision-safe ID during validation.
    const usersMissingIds = await User.find({
        $or: [{ uniqueId: { $exists: false } }, { uniqueId: null }, { uniqueId: "" }]
    });
    for (const legacyUser of usersMissingIds) {
        await legacyUser.save();
    }
    if (usersMissingIds.length) {
        console.log(`Backfilled ${usersMissingIds.length} HeartMatch IDs ✨`);
    }


    const PORT =
        process.env.PORT || 5000;


    server.listen(
        PORT,
        () => {

            console.log(
                `Server running on port ${PORT}`
            );

        }
    );

})

.catch((error) => {

    console.error(
        "MongoDB connection failed ❌"
    );

    console.error(
        error.message
    );

});
