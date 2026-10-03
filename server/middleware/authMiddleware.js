const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const User = require("../models/User");

const authMiddleware = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;

        if (!authHeader || !authHeader.startsWith("Bearer ")) {
            return res.status(401).json({
                message: "Access denied. No token provided."
            });
        }

        const token = authHeader.split(" ")[1];

        const decoded = jwt.verify(
            token,
            process.env.JWT_SECRET
        );

        if (!mongoose.Types.ObjectId.isValid(decoded.userId)) {
            return res.status(401).json({
                message: "Invalid or expired token"
            });
        }

        const user = await User.findById(decoded.userId).select("isActive tokenVersion").lean();
        if (!user || !user.isActive) {
            return res.status(401).json({
                message: "Account is unavailable"
            });
        }

        if (Number(decoded.tv || 0) !== Number(user.tokenVersion || 0)) {
            return res.status(401).json({ message: "Session expired. Please log in again." });
        }

        req.userId = decoded.userId;

        next();

    } catch (error) {
        return res.status(401).json({
            message: "Invalid or expired token"
        });
    }
};

module.exports = authMiddleware;