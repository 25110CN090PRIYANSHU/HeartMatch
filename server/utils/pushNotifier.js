const fs = require("fs");
const path = require("path");
const User = require("../models/User");

let webpush = null;
try {
  webpush = require("web-push");
} catch (e) {
  console.log("ℹ️ web-push package not installed locally yet. Push notifications will be queued or logged.");
}

// Persistent VAPID Keys
const VAPID_FILE = path.join(__dirname, "../vapid-keys.json");
let vapidKeys = {
  publicKey: process.env.VAPID_PUBLIC_KEY || "",
  privateKey: process.env.VAPID_PRIVATE_KEY || "",
  email: process.env.VAPID_EMAIL || "mailto:support@heartmatch.app"
};

if (!vapidKeys.publicKey || !vapidKeys.privateKey) {
  if (fs.existsSync(VAPID_FILE)) {
    try {
      const saved = JSON.parse(fs.readFileSync(VAPID_FILE, "utf8"));
      vapidKeys.publicKey = saved.publicKey;
      vapidKeys.privateKey = saved.privateKey;
    } catch (_) {}
  }

  if ((!vapidKeys.publicKey || !vapidKeys.privateKey) && webpush) {
    try {
      const generated = webpush.generateVAPIDKeys();
      vapidKeys.publicKey = generated.publicKey;
      vapidKeys.privateKey = generated.privateKey;
      fs.writeFileSync(VAPID_FILE, JSON.stringify(vapidKeys, null, 2));
      console.log("🔑 New VAPID keys generated and saved to vapid-keys.json");
    } catch (err) {
      console.warn("Could not generate VAPID keys:", err.message);
    }
  }
}

if (webpush && vapidKeys.publicKey && vapidKeys.privateKey) {
  try {
    webpush.setVapidDetails(
      vapidKeys.email,
      vapidKeys.publicKey,
      vapidKeys.privateKey
    );
  } catch (err) {
    console.warn("VAPID details setup warning:", err.message);
  }
}

function getVapidPublicKey() {
  return vapidKeys.publicKey || "";
}

/**
 * Send push notification to all registered devices of a user
 */
async function sendPushNotification(userId, payload) {
  if (!webpush || !vapidKeys.publicKey || !vapidKeys.privateKey) return false;
  if (!userId) return false;

  try {
    const user = await User.findById(userId).select("pushSubscriptions name");
    if (!user || !user.pushSubscriptions || user.pushSubscriptions.length === 0) {
      return false;
    }

    const notificationPayload = JSON.stringify({
      title: payload.title || "HeartMatch ❤️",
      body: payload.body || "You have a new update",
      icon: payload.icon || "/images/icons/icon-192.png",
      badge: "/images/icons/icon-192.png",
      url: payload.url || "/discover.html",
      tag: payload.tag || "heartmatch-alert",
      data: payload.data || {}
    });

    const failedEndpoints = [];

    const sendPromises = user.pushSubscriptions.map(async (sub) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: {
              p256dh: sub.keys.p256dh,
              auth: sub.keys.auth
            }
          },
          notificationPayload,
          {
            TTL: 60 * 60 * 24 // 24 hours
          }
        );
      } catch (err) {
        // 404 or 410 means subscription has expired / user uninstalled app
        if (err.statusCode === 404 || err.statusCode === 410) {
          failedEndpoints.push(sub.endpoint);
        } else {
          console.warn("Push delivery error for endpoint:", err.message);
        }
      }
    });

    await Promise.all(sendPromises);

    // Clean up expired subscriptions
    if (failedEndpoints.length > 0) {
      await User.updateOne(
        { _id: userId },
        { $pull: { pushSubscriptions: { endpoint: { $in: failedEndpoints } } } }
      );
    }

    return true;
  } catch (error) {
    console.error("sendPushNotification error:", error.message);
    return false;
  }
}

module.exports = {
  getVapidPublicKey,
  sendPushNotification
};
