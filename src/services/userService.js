import User from "../models/User.js";
export const getAllUsers = async () => {
  try {
    const users = await User.find();
    return users;
  } catch (error) {
    throw error;
  }
};
