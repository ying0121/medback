const express = require("express");
const {
  listUsers,
  createUser,
  updateUser,
  deleteUser,
  changeUserPassword
} = require("../controllers/adminUserController");

const router = express.Router();

router.get("/users", listUsers);
router.post("/users", createUser);
router.put("/users/:id", updateUser);
router.delete("/users/:id", deleteUser);
router.patch("/users/:id/password", changeUserPassword);

module.exports = router;
