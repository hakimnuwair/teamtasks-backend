import * as authService from "../services/authService.js";

export const registerUser = async (req, res) => {
  try {
    const response = await authService.saveUser(req.body);
    res.status(200).json(response);
  } catch (error) {
    console.log("register error: ", error);
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
    const { email, password } = req.body;

    const response = await authService.loginUser({ email, password });

    if (!response.success) {
      return res.status(401).json({
        message: response.message,
      });
    }

    return res.status(200).json(response.data);
  } catch (error) {
    console.error("Login Error:", error);
    return res.status(500).json({
      message: "Internal server error",
    });
  }
};
