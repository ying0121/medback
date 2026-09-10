const express = require("express");
const {
  listDoctors,
  getDoctor,
  createDoctor,
  updateDoctor,
  deleteDoctor
} = require("../controllers/adminDoctorController");

const router = express.Router();

router.get("/", listDoctors);
router.get("/:id", getDoctor);
router.post("/", createDoctor);
router.put("/:id", updateDoctor);
router.delete("/:id", deleteDoctor);

module.exports = router;
