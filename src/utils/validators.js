const Joi = require("joi");

const sendMessageSchema = Joi.object({
  conversationId: Joi.number().integer().positive().required(),
  text: Joi.string().min(1).max(4000).required(),
  messageType: Joi.string().valid("chat", "voice").default("chat"),
  isTopic: Joi.boolean().default(false)
});

const createConversationSchema = Joi.object({
  clinicId: Joi.number().integer().positive().required(),
  userInfo: Joi.string().min(1).required()
});

const alertSchema = Joi.object({
  subject: Joi.string().min(1).max(255).required(),
  message: Joi.string().min(1).max(3000).required()
});
const knowledgeStatusSchema = Joi.string().valid("active", "inactive");

const userRoleSchema = Joi.string().valid("Admin", "Clinic Staff");
const userStatusSchema = Joi.string().valid("active", "inactive");
const clinicIdsSchema = Joi.array()
  .items(Joi.alternatives().try(Joi.number().integer().positive(), Joi.string().min(1).max(64)))
  .default([]);

const createUserSchema = Joi.object({
  fname: Joi.string().min(1).max(100).required(),
  lname: Joi.string().min(1).max(100).required(),
  email: Joi.string().email().max(255).required(),
  password: Joi.string().min(1).max(255).required(),
  phone: Joi.string().allow("", null).max(30).optional(),
  role: userRoleSchema.default("Clinic Staff"),
  status: userStatusSchema.default("active"),
  dob: Joi.date().iso().required(),
  address: Joi.string().allow("", null).max(255).optional(),
  city: Joi.string().allow("", null).max(100).optional(),
  state: Joi.string().allow("", null).max(100).optional(),
  zip: Joi.string().allow("", null).max(20).optional(),
  photo: Joi.string().allow("", null).max(2000000).optional(),
  clinics: clinicIdsSchema.optional(),
  clinicIds: clinicIdsSchema.optional()
});

const updateUserSchema = Joi.object({
  fname: Joi.string().min(1).max(100).optional(),
  lname: Joi.string().min(1).max(100).optional(),
  email: Joi.string().email().max(255).optional(),
  phone: Joi.string().allow("", null).max(30).optional(),
  role: userRoleSchema.optional(),
  status: userStatusSchema.optional(),
  dob: Joi.date().iso().optional(),
  address: Joi.string().allow("", null).max(255).optional(),
  city: Joi.string().allow("", null).max(100).optional(),
  state: Joi.string().allow("", null).max(100).optional(),
  zip: Joi.string().allow("", null).max(20).optional(),
  photo: Joi.string().allow("", null).max(2000000).optional(),
  clinics: clinicIdsSchema.optional(),
  clinicIds: clinicIdsSchema.optional()
}).min(1);

const changePasswordSchema = Joi.object({
  password: Joi.string().min(1).max(255).required()
});

const createKnowledgeSchema = Joi.object({
  clinicId: Joi.number().integer().positive().required(),
  knowledge: Joi.string().min(1).required(),
  status: knowledgeStatusSchema.default("active")
});

const updateKnowledgeSchema = Joi.object({
  clinicId: Joi.number().integer().positive().optional(),
  knowledge: Joi.string().min(1).optional(),
  status: knowledgeStatusSchema.optional()
}).min(1);

const updateKnowledgeStatusSchema = Joi.object({
  status: knowledgeStatusSchema.required()
});

module.exports = {
  sendMessageSchema,
  createConversationSchema,
  alertSchema,
  createUserSchema,
  updateUserSchema,
  changePasswordSchema,
  createKnowledgeSchema,
  updateKnowledgeSchema,
  updateKnowledgeStatusSchema
};
