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

        if (!(await User.exists({ _id: decoded.userId, isActive: true }))) {
            return res.status(401).json({
                message: "Account is unavailable"
            });
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