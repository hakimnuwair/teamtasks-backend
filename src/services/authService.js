import User from "../models/User.js";

export const saveUser = async (user) => {
  try {
    const newUser = new User(user);
    return newUser.save();
  } catch (error) {
    throw error;
  }
};

export const getCurrentUserDetails = async (user) => {
  try {
    const savedUser = await User.findOne({ email: user.email });
    if (!savedUser) return false;

    return savedUser;
  } catch (error) {
    throw error;
  }
};

export const loginUser = async (user) => {
  try {
    const savedUser = await User.findOne({ email: user.email });

    if (!savedUser) return false;

    if (savedUser.password == user.password) {
      return savedUser;
    }

    return false;
  } catch (error) {
    throw error;
  }
};
