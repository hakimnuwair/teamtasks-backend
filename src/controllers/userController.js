import * as userService from "../services/userService.js";
export const getAllUsers = async (req, res) => {
  try {
    const response = await userService.getAllUsers();
    res.status(200).json(response);
  } catch (error) {
    res.status(500).json({ message: "Internal server error" });
  }
};
