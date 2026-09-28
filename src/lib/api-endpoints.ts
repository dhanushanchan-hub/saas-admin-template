interface APIResponse {
  name?: string;
  example: any;
  description?: string;
}

interface APIEndpoint {
  method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
  path: string;
  description: string;
  parameters?: {
    name: string;
    type: string;
    required: boolean;
    description: string;
  }[];
  requestBody?: {
    example: any;
    description?: string;
  };
  responses: APIResponse[];
}

const apiEndpoints: APIEndpoint[] = [
  {
    method: "GET",
    path: "/api/customers",
    description: "Retrieve a list of all customers",
    responses: [
      {
        name: "Response",
        example: {
          customers: [
            {
              id: 1,
              name: "John Doe",
              email: "john@example.com",
            },
            {
              id: 2,
              name: "Jane Smith",
              email: "jane@example.com",
            },
          ],
        },
        description: "Returns an array of customer objects",
      },
      {
        name: "Response (with subscriptions)",
        example: {
          customers: [
            {
              id: 1,
              name: "John Doe",
              email: "john@example.com",
              subscription: {
                id: 1,
                status: "active",
              },
            },
            {
              id: 2,
              name: "Jane Smith",
              email: "jane@example.com",
            },
          ],
        },
        description:
          "If subscriptions are active for a customer, some information about the subscription will be included in the response.",
      },
    ],
  },
  {
    method: "POST",
    path: "/api/customers",
    description: "Create a new customer",
    parameters: [
      {
        name: "name",
        type: "string",
        required: true,
        description: "Name of the customer",
      },
      {
        name: "email",
        type: "string",
        required: true,
        description: "Email address of the customer",
      },
      {
        name: "notes",
        type: "string",
        required: false,
        description: "Notes about the customer",
      },
    ],
    requestBody: {
      example: {
        name: "John Doe",
        email: "john@example.com",
        notes: "This is a note",
      },
    },
    responses: [
      {
        name: "Response",
        example: {
          message: "Customer created successfully",
          success: true,
        },
      },
    ],
  },
  {
    method: "GET",
    path: "/api/customers/:id",
    description: "Retrieve a single customer",
    parameters: [
      {
        name: "id",
        type: "string",
        required: true,
        description: "ID of the customer",
      },
    ],
    responses: [
      {
        name: "Response",
        example: {
          customer: {
            id: 1,
            name: "John Doe",
            email: "john@example.com",
          },
        },
        description: "Returns a customer object",
      },
    ],
  },
  {
    method: "GET",
    path: "/api/subscriptions",
    description: "Retrieve a list of all subscriptions",
    responses: [
      {
        example: {
          subscriptions: [
            {
              id: 1,
              name: "Basic",
              description: "$9.99 per month",
              price: 9.99,
              created_at: "2023-01-01T00:00:00.000Z",
              updated_at: "2023-01-01T00:00:00.000Z",
            },
            {
              id: 2,
              name: "Pro",
              description: "$19.99 per month",
              price: 19.99,
              created_at: "2023-01-01T00:00:00.000Z",
              updated_at: "2023-01-01T00:00:00.000Z",
            },
          ],
        },
        description: "Returns an array of subscription objects",
      },
    ],
  },
  {
    method: "POST",
    path: "/api/subscriptions",
    description: "Create a new subscription",
    parameters: [
      {
        name: "name",
        type: "string",
        required: true,
        description: "Name of the subscription",
      },
      {
        name: "description",
        type: "string",
        required: false,
        description: "Description of the subscription",
      },
      {
        name: "price",
        type: "number",
        required: true,
        description: "Price of the subscription",
      },
      {
        name: "features",
        type: "array",
        required: false,
        description: "Array of feature objects",
      },
    ],
    requestBody: {
      example: {
        name: "Basic",
        description: "$9.99 per month",
        price: 9.99,
        features: [
          {
            name: "Feature 1",
            description: "This is a feature description",
          },
          {
            name: "Feature 2",
            description: "This is another feature description",
          },
        ],
      },
    },
    responses: [
      {
        name: "Response",
        example: {
          message: "Customer created successfully",
          success: true,
        },
      },
    ],
  },
  {
    method: "GET",
    path: "/api/subscriptions/:id",
    description: "Retrieve a single subscription",
    parameters: [
      {
        name: "id",
        type: "string",
        required: true,
        description: "ID of the subscription",
      },
    ],
    responses: [
      {
        name: "Response",
        example: {
          subscription: {
            id: 1,
            name: "Basic",
            description: "$9.99 per month",
            price: 9.99,
            created_at: "2023-01-01T00:00:00.000Z",
            updated_at: "2023-01-01T00:00:00.000Z",
          },
        },
        description: "Returns a subscription object",
      },
    ],
  },
  {
    method: "GET",
    path: "/api/customer_subscriptions",
    description: "Retrieve a list of all customer subscriptions",
    responses: [
      {
        example: {
          customer_subscriptions: [
            {
              id: 1,
              customer_id: 1,
              subscription_id: 1,
              status: "active",
              subscription_starts_at: "2024-12-23 21:57:21",
              subscription_ends_at: 1734993633434,
              created_at: "2024-12-23 21:57:21",
              updated_at: "2024-12-23 21:57:21",
            },
          ],
        },
        description: "Returns an array of customer subscription objects",
      },
    ],
  },
  {
    method: "POST",
    path: "/api/customer-subscriptions",
    description: "Create a new customer subscription",
    parameters: [
      {
        name: "customer_id",
        type: "string",
        required: true,
        description: "ID of the customer",
      },
      {
        name: "subscription_id",
        type: "string",
        required: true,
        description: "ID of the subscription plan",
      },
      {
        name: "start_date",
        type: "string",
        required: true,
        description: "Start date of the subscription (ISO 8601 format)",
      },
      {
        name: "end_date",
        type: "string",
        required: false,
        description: "End date of the subscription (ISO 8601 format)",
      },
    ],
    requestBody: {
      example: {
        customer_id: "456",
        subscription_id: "789",
        start_date: "2024-01-01",
        end_date: "2025-01-01",
      },
    },
    responses: [
      {
        name: "Success Response",
        example: {
          message: "Customer subscription created successfully",
          success: true,
          customer_subscription: {
            id: "123",
            customer_id: "456",
            subscription_id: "789",
            status: "active",
            start_date: "2024-01-01",
            end_date: "2025-01-01",
            current_period_start: "2024-01-01",
            current_period_end: "2024-02-01",
            cancel_at_period_end: false,
            created_at: "2024-01-01T00:00:00Z",
            updated_at: "2024-01-01T00:00:00Z",
          },
        },
      },
      {
        name: "Error Response",
        example: {
          message: "Couldn't create customer subscription",
          success: false,
        },
      },
    ],
  },
  {
    method: "POST",
    path: "/api/customer/[:id]/workflow",
    description: "Start a workflow for a customer",
    parameters: [
      {
        name: "customer_id",
        type: "string",
        required: true,
        description: "ID of the customer",
      },
    ],
    responses: [
      {
        name: "Success Response",
        description: "Empty body with status code 202",
        example: null,
      },
    ],
  },
  {
    method: "POST",
    path: "/api/hermes/chat",
    description:
      "Talk to Hermes. Hermes replies, and may start a mission or save what you said to the team's memory. GET returns the conversation.",
    requestBody: {
      example: { message: "Have the team plan the Master ID launch" },
    },
    responses: [
      {
        name: "Response",
        example: {
          reply: "On it. Atlas and Ledger are planning it now.",
          mission: { id: 12, title: "Master ID launch plan", status: "queued" },
          memory: null,
        },
      },
    ],
  },
  {
    method: "POST",
    path: "/api/missions",
    description:
      "Give the agent team a directive. Hermes plans it, the executives work on it in the background, and the mission ends with a brief. Poll GET /api/missions/:id for progress.",
    requestBody: {
      example: {
        directive: "Plan the MVP launch of TIVA Master ID, with budget and delivery plan.",
        entity_id: "tiva-family-holding",
        priority: "high",
      },
      description:
        "directive is required. title, entity_id, priority (low | normal | high | critical) and origin (founder | api) are optional.",
    },
    responses: [
      {
        name: "Accepted",
        example: { mission: { id: 1, status: "queued", title: "Plan the MVP launch of TIVA Master ID..." } },
        description: "Status 202. Returns 503 if ANTHROPIC_API_KEY is not configured.",
      },
    ],
  },
  {
    method: "GET",
    path: "/api/missions/:id",
    description: "A mission with its plan, every assignment's deliverable, the brief and the decisions for the Founder.",
    responses: [
      {
        name: "Response",
        example: {
          mission: { id: 1, status: "completed", brief: "**Outcome:** ...", decisions: [{ question: "...", recommendation: "...", owner: "Ledger" }] },
          tasks: [{ agent_id: "atlas", title: "Platform architecture", status: "completed", output: "..." }],
        },
      },
    ],
  },
  {
    method: "GET",
    path: "/api/briefing",
    description: "Snapshot for the Founder's assistant: missions in flight, the latest briefs and the decisions waiting on the Founder.",
    responses: [
      {
        name: "Response",
        example: { stats: { in_flight: 1, completed_24h: 3 }, in_flight: [], latest_briefs: [], decisions: [] },
      },
    ],
  },
  {
    method: "POST",
    path: "/api/knowledge",
    description: "Teach the team something. Every agent the entry applies to sees it on every mission.",
    requestBody: {
      example: { title: "Q4 goal", content: "Launch Master ID by December.", scope: "global" },
      description: "scope is global | department | entity | agent; scope_ref names the department, entity or agent.",
    },
    responses: [{ name: "Created", example: { entry: { id: 3, title: "Q4 goal" } } }],
  },
  {
    method: "GET",
    path: "/api/agents",
    description: "The agent team. PATCH /api/agents/:id updates an agent's status, mission, charter or model.",
    responses: [{ name: "Response", example: { agents: [{ id: "atlas", name: "Atlas", title: "Chief Technology Officer" }] } }],
  },
  {
    method: "GET",
    path: "/api/entities",
    description: "The group structure, parent first. POST creates an entity (name, kind, parent_id, category, region).",
    responses: [{ name: "Response", example: { entities: [{ id: "tiva-family-holding", name: "TIVA Family Holding Company", depth: 0 }] } }],
  },
  {
    method: "POST",
    path: "/api/routines/:id/run",
    description:
      "Run a 24/7 routine now. GET /api/routines lists them; PATCH /api/routines/:id changes the schedule or pauses one.",
    responses: [{ name: "Accepted", example: { mission: { id: 7, origin: "routine" } } }],
  },
];

export { apiEndpoints };
