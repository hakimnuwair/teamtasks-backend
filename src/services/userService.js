import User from "../models/User.js";
export const getAllUsers = async () => {
  try {
    const users = await User.find().select("-password");
    return users;
  } catch (error) {
    throw error;
  }
};
