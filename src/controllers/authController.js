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

export const refreshAccessToken = async (req, res) => {
  try {
    const refreshToken = req.cookies.refreshToken;

    const newAccessToken = await authService.handleRefreshToken(refreshToken);

    return res.status(200).json({
      success: true,
      accessToken: newAccessToken,
    });
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: error.message,
    });
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

    const { accessToken, refreshToken, user } = response.data;

    // Set Refresh Token in httpOnly cookie
    res.cookie("refreshToken", refreshToken, {
      httpOnly: true,
      secure: false, // true in production (HTTPS)
      sameSite: "lax", // "none" in production with HTTPS
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });

    // Send access token in response body
    return res.status(200).json({
      accessToken,
      user,
    });
  } catch (error) {
    console.error("Login Error:", error);
    return res.status(500).json({
      message: "Internal server error",
    });
  }
};

export const logoutUser = async (req, res) => {
  try {
    const refreshToken = req.cookies.refreshToken;

    await authService.handleLogout(refreshToken);

    res.clearCookie("refreshToken", {
      httpOnly: true,
      secure: false,
      sameSite: "lax",
    });

    return res.status(200).json({
      message: "Logged out successfully",
    });
  } catch (error) {
    return res.status(500).json({
      message: "Internal server error",
    });
  }
};
