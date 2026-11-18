const pop = (f) => ({ $and: [{ $ne: [{ $ifNull: [f, null] }, null] }, { $ne: [f, ""] }] });
const count = (cond) => ({ $sum: { $cond: [cond, 1, 0] } });

const pipeline = [
  { $match: { role: "tenant" } },
  {
    $project: {
      has_tenant_id: pop("$tenant_id"),
      has_school_id: pop("$school_id"),
      has_tenant_name: pop("$tenant_name"),
      has_organisation: pop("$organisation"),
      has_legacy_tenantId: pop("$tenantId"),
      has_password: pop("$hashed_password"),
      has_firebase_uid: pop("$firebase_uid"),
      has_phone: pop("$phone"),
      email_equals_phone: { $and: [pop("$phone"), { $eq: ["$email", "$phone"] }] },
      is_active: { $ne: ["$is_active", false] },
      migrated_from: { $ifNull: ["$migrated_from", null] },
      tenant_id_type: { $type: "$tenant_id" },
      school_id_type: { $type: "$school_id" },
      has_email: pop("$email"),
      email_has_at: {
        $regexMatch: {
          input: { $convert: { input: "$email", to: "string", onError: "", onNull: "" } },
          regex: "@",
        },
      },
      self_tenant: {
        $eq: [
          { $convert: { input: "$tenant_id", to: "string", onError: null, onNull: null } },
          { $toString: "$_id" },
        ],
      },
      tid_oid: { $convert: { input: "$tenant_id", to: "objectId", onError: null, onNull: null } },
      created: {
        $convert: {
          input: { $ifNull: ["$created_at", "$createdAt"] },
          to: "date", onError: null, onNull: null,
        },
      },
    },
  },
  { $lookup: { from: "users", localField: "tid_oid", foreignField: "_id", as: "tref" } },
  {
    $project: {
      _id: 0,
      has_tenant_id: 1, has_school_id: 1, has_tenant_name: 1, has_organisation: 1,
      has_legacy_tenantId: 1, has_password: 1, has_firebase_uid: 1, is_active: 1,
      has_phone: 1, email_equals_phone: 1, has_email: 1, email_has_at: 1,
      migrated_from: 1, tenant_id_type: 1, school_id_type: 1, self_tenant: 1, created: 1,
      tenant_id_target_role: { $ifNull: [{ $arrayElemAt: ["$tref.role", 0] }, null] },
      month: { $dateToString: { format: "%Y-%m", date: "$created" } },
    },
  },
  {
    $facet: {
      totals: [
        {
          $group: {
            _id: null,
            total_tenants: { $sum: 1 },
            with_tenant_id: count("$has_tenant_id"),
            with_school_id: count("$has_school_id"),
            with_tenant_name_or_organisation: count({ $or: ["$has_tenant_name", "$has_organisation"] }),
            with_tenant_id_and_school_id_no_name_no_org: count({
              $and: ["$has_tenant_id", "$has_school_id", { $not: ["$has_tenant_name"] }, { $not: ["$has_organisation"] }],
            }),
            with_phone: count("$has_phone"),
            email_equals_phone: count("$email_equals_phone"),
            email_without_at: count({ $not: ["$email_has_at"] }),
            migrated: count({ $ne: ["$migrated_from", null] }),
            missing_created_at: count({ $eq: ["$created", null] }),
          },
        },
        { $project: { _id: 0 } },
      ],
      combinations: [
        {
          $group: {
            _id: {
              tenant_id: "$has_tenant_id",
              school_id: "$has_school_id",
              tenant_name: "$has_tenant_name",
              organisation: "$has_organisation",
              legacy_tenantId: "$has_legacy_tenantId",
              phone: "$has_phone",
              email_equals_phone: "$email_equals_phone",
              has_email: "$has_email",
              email_has_at: "$email_has_at",
              migrated_from: "$migrated_from",
              self_tenant: "$self_tenant",
              tenant_id_target_role: "$tenant_id_target_role",
              tenant_id_type: "$tenant_id_type",
              school_id_type: "$school_id_type",
            },
            count: { $sum: 1 },
            active: count("$is_active"),
            with_password: count("$has_password"),
            with_firebase_uid: count("$has_firebase_uid"),
            first_created: { $min: "$created" },
            last_created: { $max: "$created" },
          },
        },
        { $sort: { count: -1 } },
      ],
      created_by_month: [
        {
          $group: {
            _id: { month: "$month", tenant_id: "$has_tenant_id", name_or_org: { $or: ["$has_tenant_name", "$has_organisation"] } },
            count: { $sum: 1 },
          },
        },
        { $sort: { "_id.month": 1, "_id.tenant_id": 1 } },
      ],
    },
  },
];

const result = db.getCollection("users")
  .aggregate(pipeline, { maxTimeMS: 120000, comment: "ticket-773-readonly-tenant-audit" })
  .toArray();
print(EJSON.stringify(result, null, 2, { relaxed: true }));
