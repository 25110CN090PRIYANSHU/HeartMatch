const mongoose = require("mongoose");
const Like = require("../models/Like");
const User = require("../models/User");

// In-memory queue & sessions for 3-minute Blind Chemistry Lounge
const blindQueue = [];
const activeSessions = new Map();

function initBlindLounge(io) {
    io.on("connection", (socket) => {

        // 1. Join matchmaking queue
        socket.on("blind:joinQueue", async (data) => {
            try {
                const userId = socket.userId || data?.userId;
                if (!userId) {
                    return socket.emit("blind:error", { message: "Authentication required" });
                }

                // Check if already in active session
                for (const [sId, sess] of activeSessions.entries()) {
                    if (sess.userA.userId === userId || sess.userB.userId === userId) {
                        return socket.emit("blind:alreadyInSession", { sessionId: sId });
                    }
                }

                // Remove existing queue entry if any
                const existingIdx = blindQueue.findIndex(q => q.userId === userId);
                if (existingIdx !== -1) blindQueue.splice(existingIdx, 1);

                // Fetch user data for matchmaking
                const user = await User.findById(userId).select("name gender lookingFor profileImage anthem loveLanguage socialEnergy").lean();
                if (!user) {
                    return socket.emit("blind:error", { message: "User not found" });
                }

                // Match with someone in queue
                let matchIdx = -1;
                for (let i = 0; i < blindQueue.length; i++) {
                    const candidate = blindQueue[i];
                    if (candidate.userId !== userId) {
                        matchIdx = i;
                        break;
                    }
                }

                if (matchIdx !== -1) {
                    const partner = blindQueue.splice(matchIdx, 1)[0];
                    const sessionId = "blind_" + Date.now() + "_" + Math.random().toString(36).slice(2, 7);

                    const session = {
                        id: sessionId,
                        userA: { socketId: socket.id, userId: String(userId), user },
                        userB: { socketId: partner.socket.id, userId: String(partner.userId), user: partner.user },
                        reveals: {},
                        createdAt: Date.now(),
                        duration: 180
                    };

                    activeSessions.set(sessionId, session);
                    socket.join(sessionId);
                    partner.socket.join(sessionId);

                    // Send matched event to userA
                    socket.emit("blind:matched", {
                        sessionId,
                        duration: 180,
                        partner: {
                            id: String(partner.userId),
                            name: partner.user.name ? partner.user.name.split(" ")[0] : "Mystery Match",
                            avatar: partner.user.profileImage || "/images/default-avatar.svg",
                            loveLanguage: partner.user.loveLanguage || "Quality Time ☕",
                            anthem: partner.user.anthem?.title ? `${partner.user.anthem.title} - ${partner.user.anthem.artist}` : ""
                        }
                    });

                    // Send matched event to userB
                    partner.socket.emit("blind:matched", {
                        sessionId,
                        duration: 180,
                        partner: {
                            id: String(userId),
                            name: user.name ? user.name.split(" ")[0] : "Mystery Match",
                            avatar: user.profileImage || "/images/default-avatar.svg",
                            loveLanguage: user.loveLanguage || "Quality Time ☕",
                            anthem: user.anthem?.title ? `${user.anthem.title} - ${user.anthem.artist}` : ""
                        }
                    });

                    console.log(`[BlindLounge] Session started: ${sessionId} between ${userId} & ${partner.userId}`);

                } else {
                    // Put in queue
                    blindQueue.push({
                        socket,
                        userId: String(userId),
                        user
                    });
                    socket.emit("blind:waiting", { message: "Looking for someone special..." });
                }

            } catch (err) {
                console.error("blind:joinQueue error:", err);
                socket.emit("blind:error", { message: "Failed to join lounge" });
            }
        });

        // 2. Send mystery message
        socket.on("blind:sendMessage", (data) => {
            const { sessionId, text } = data || {};
            if (!sessionId || !text || !activeSessions.has(sessionId)) return;

            const session = activeSessions.get(sessionId);
            const senderId = socket.userId || (socket.id === session.userA.socketId ? session.userA.userId : session.userB.userId);

            io.to(sessionId).emit("blind:message", {
                sessionId,
                senderId: String(senderId),
                text: String(text).slice(0, 1000),
                time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
            });
        });

        // 3. Consent to Reveal & Match
        socket.on("blind:reveal", async (data) => {
            try {
                const { sessionId } = data || {};
                if (!sessionId || !activeSessions.has(sessionId)) return;

                const session = activeSessions.get(sessionId);
                const userId = String(socket.userId || (socket.id === session.userA.socketId ? session.userA.userId : session.userB.userId));

                session.reveals[userId] = true;
                socket.to(sessionId).emit("blind:partnerRevealed", { partnerId: userId });

                const bothRevealed = session.reveals[session.userA.userId] && session.reveals[session.userB.userId];

                if (bothRevealed) {
                    // Create permanent mutual match in DB!
                    const idA = session.userA.userId;
                    const idB = session.userB.userId;

                    await Promise.all([
                        Like.findOneAndUpdate(
                            { from: idA, to: idB },
                            { from: idA, to: idB, type: "like" },
                            { upsert: true, new: true }
                        ),
                        Like.findOneAndUpdate(
                            { from: idB, to: idA },
                            { from: idB, to: idA, type: "like" },
                            { upsert: true, new: true }
                        )
                    ]);

                    io.to(sessionId).emit("blind:mutualReveal", {
                        message: "It's a Match! 🎉 Fireworks unlocked!",
                        userA: {
                            id: idA,
                            name: session.userA.user.name,
                            avatar: session.userA.user.profileImage
                        },
                        userB: {
                            id: idB,
                            name: session.userB.user.name,
                            avatar: session.userB.user.profileImage
                        }
                    });

                    // Cleanup session after reveal
                    setTimeout(() => {
                        activeSessions.delete(sessionId);
                    }, 5000);
                }

            } catch (err) {
                console.error("blind:reveal error:", err);
            }
        });

        // 4. Leave lounge / session
        socket.on("blind:leave", (data) => {
            const { sessionId } = data || {};
            const userId = socket.userId;

            // Remove from queue
            const qIdx = blindQueue.findIndex(q => q.socket.id === socket.id || q.userId === userId);
            if (qIdx !== -1) blindQueue.splice(qIdx, 1);

            if (sessionId && activeSessions.has(sessionId)) {
                socket.to(sessionId).emit("blind:partnerLeft", { message: "Partner has left the lounge." });
                activeSessions.delete(sessionId);
            }
        });

        // Cleanup on disconnect
        socket.on("disconnect", () => {
            const qIdx = blindQueue.findIndex(q => q.socket.id === socket.id);
            if (qIdx !== -1) blindQueue.splice(qIdx, 1);

            for (const [sId, sess] of activeSessions.entries()) {
                if (sess.userA.socketId === socket.id || sess.userB.socketId === socket.id) {
                    socket.to(sId).emit("blind:partnerLeft", { message: "Partner disconnected from lounge." });
                    activeSessions.delete(sId);
                    break;
                }
            }
        });

    });
}

module.exports = { initBlindLounge };
