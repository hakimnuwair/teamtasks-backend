import * as authService from "../services/authService.js";
export const getMyAuthDetails = (req, res) => {
  res.send("my auth information!");
};

export const registerUser = async (req, res) => {
  try {
    const response = await authService.saveUser(req.body);
    res.status(200).json(response);
  } catch (error) {
    throw error;
  }
};
