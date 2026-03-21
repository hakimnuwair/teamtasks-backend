/**
 * controllers/userController.js
 *
 * Thin controller layer — validates input, calls service, sends response.
 * All business logic lives in userService.js.
 */

import * as userService from "../services/userService.js";

// GET /users
export const getAllUsers = async (req, res, next) => {
  try {
    const users = await userService.getAllUsers();
    res.json({ success: true, data: users });
  } catch (err) {
    next(err);
  }
};

// GET /users/search?q=...
export const searchUsers = async (req, res, next) => {
  try {
    const query = (req.query.q ?? "").trim();
    if (!query) {
      return res
        .status(400)
        .json({ success: false, message: "Query parameter 'q' is required" });
    }
    const users = await userService.searchUsers(query, req.user._id);
    res.json({ success: true, data: users });
  } catch (err) {
    next(err);
  }
};

// GET /users/:id
export const getUserById = async (req, res, next) => {
  try {
    const user = await userService.getUserById(req.params.id);
    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }
    res.json({ success: true, data: user });
  } catch (err) {
    next(err);
  }
};

// PATCH /users/:id
export const updateUser = async (req, res, next) => {
  try {
    const updated = await userService.updateUser(
      req.params.id,
      req.body,
      req.user._id,
    );
    res.json({ success: true, data: updated });
  } catch (err) {
    next(err);
  }
};
