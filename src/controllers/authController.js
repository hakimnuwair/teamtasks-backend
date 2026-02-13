import * as authService from "../services/authService.js";

export const registerUser = async (req, res) => {
  try {
    const response = await authService.saveUser(req.body);
    res.status(200).json(response);
  } catch (error) {
    res.status(500).json({ message: "Internal server error" });
  }
};

export const getMyAuthDetails = async (req, res) => {
  try {
    const response = await authService.getCurrentUserDetails(req.body);
    if (response) {
      res.status(200).json(response);
    } else {
      res.status(404).json({ message: "User not found" });
    }
  } catch (error) {
    res.status(500).json({ message: "Internal server error" });
  }
};

export const loginUser = async (req, res) => {
  try {
    const response = await authService.loginUser(req.body);
    if (response) {
      res.status(200).json(response);
    } else {
      res.status(401).json({ message: "Invalid username or password" });
    }
  } catch (error) {
    res.status(500).json({ message: "Internal server error" });
  }
};
