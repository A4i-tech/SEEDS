"use strict";

const express = require("express");
const authenticateToken = require("../auth/authenticateToken");
const contentCreatorAuthProvider = require("../auth/contentCreator/contentCreatorAuthProviderMiddleware");
const { STATUS } = require("../config/constants");

const router = express.Router();

router.post("/register", contentCreatorAuthProvider.register);
router.post("/login", contentCreatorAuthProvider.login);
router.post("/tenant/register", authenticateToken, async (req, res) => {
  if (req.userRole !== "tenant") {
    return res.status(STATUS.FORBIDDEN).json({
      message: "Only tenant accounts can add content creators",
    });
  }
  return contentCreatorAuthProvider.registerForTenant(req, res);
});

router.get("/", authenticateToken, async (req, res) => {
  try {
    const creators = await contentCreatorAuthProvider.getContentCreatorsByTenantId(req.tenantId);
    return res.status(STATUS.OK).json(
      creators.map((creator) => ({
        id: creator._id || creator.id,
        email: creator.email,
        name: creator.name,
        tenantId: creator.tenantId,
      })),
    );
  } catch (error) {
    console.error("List content creators error:", error);
    return res
      .status(STATUS.INTERNAL_ERROR)
      .json({ message: "Internal server error" });
  }
});

router.get("/me", authenticateToken, async (req, res) => {
  if (req.userRole !== "content_creator") {
    return res.status(STATUS.FORBIDDEN).json({ message: "Forbidden" });
  }

  try {
    const creator = await contentCreatorAuthProvider.getContentCreatorById(req.userId);
    if (!creator) {
      return res.status(STATUS.NOT_FOUND).json({ message: "Content creator not found" });
    }
    return res.status(STATUS.OK).json({
      email: creator.email,
      name: creator.name,
      tenantId: creator.tenantId,
      role: "content_creator",
    });
  } catch (error) {
    console.error("Get content creator profile error:", error);
    return res
      .status(STATUS.INTERNAL_ERROR)
      .json({ message: "Internal server error" });
  }
});

module.exports = router;
