export const API_BASE =
  import.meta.env.VITE_API_URL ||
  `http://${window.location.hostname}:5050`;

const API = `${API_BASE}/api`;


async function request(path, options = {}) {


  const token = localStorage.getItem("token");


  const response = await fetch(`${API}${path}`, {

    headers: {

      "Content-Type": "application/json",

      ...(token
        ? {
            Authorization: `Bearer ${token}`
          }
        : {}),

      ...(options.headers || {})

    },

    ...options

  });



  if (!response.ok) {


    const text = await response.text();


    const error = new Error(
      text || "API request failed"
    );

    error.status = response.status;

    throw error;


  }


  return response.json();


}



/* ---------- Auth ---------- */


export const login = (email, password) =>

  request("/auth/login", {

    method:"POST",

    body: JSON.stringify({

      email,

      password

    })

  });



export const register = (

  name,

  email,

  password,

  business_id

) =>

  request("/auth/register", {

    method:"POST",

    body: JSON.stringify({

      name,

      email,

      password,

      business_id

    })

  });



export const forgotPassword = (email) =>

  request("/auth/forgot-password", {

    method:"POST",

    body: JSON.stringify({

      email

    })

  });



export const resetPassword = (

  token,

  password

) =>

  request("/auth/reset-password", {

    method:"POST",

    body: JSON.stringify({

      token,

      password

    })

  });



export const getTeammates = () =>

  request("/auth/teammates");



export const inviteTeammate = (name, email, password) =>

  request("/auth/teammates", {

    method: "POST",

    body: JSON.stringify({

      name,

      email,

      password

    })

  });



export const removeTeammate = (id) =>

  request(`/auth/teammates/${id}`, {

    method: "DELETE"

  });



export const changePassword = (currentPassword, newPassword) =>

  request("/auth/password", {

    method: "PUT",

    body: JSON.stringify({

      currentPassword,

      newPassword

    })

  });





/* ---------- Business ---------- */


export const getBusinesses = () =>

  request("/business");





/* ---------- Customers ---------- */


export const getCustomers = () =>

  request("/customers");



export const createCustomer = (

  name,

  email,

  phone

) =>

  request("/customers", {

    method: "POST",

    body: JSON.stringify({

      name,

      email,

      phone

    })

  });



export const getCustomer = (id) =>

  request(`/customers/${id}`);



export const deleteCustomer = (id) =>

  request(`/customers/${id}`, {

    method: "DELETE"

  });



export const updateCustomerInfo = (

  id,

  name,

  email,

  phone

) =>

  request(`/customers/${id}`, {

    method: "PUT",

    body: JSON.stringify({

      name,

      email,

      phone

    })

  });





/* ---------- Leads ---------- */


export const getLeads = () =>

  request("/leads");



export const updateLeadStatus = (

  id,

  status

) =>

  request(`/leads/${id}`, {

    method:"PATCH",

    body: JSON.stringify({

      status

    })

  });





/* ---------- Tasks ---------- */


export const getTasks = () =>

  request("/tasks");



export const createTask = (

  customer_id,

  title,

  description,

  due_date

) =>

  request("/tasks", {

    method:"POST",

    body: JSON.stringify({

      customer_id,

      title,

      description,

      due_date

    })

  });



export const completeTask = (id) =>

  request(`/tasks/${id}`, {

    method:"PATCH"

  });





/* ---------- Knowledge ---------- */


export const getKnowledge = (businessId) =>

  request(`/knowledge/${businessId}`);



export const createKnowledge = (

  businessId,

  title,

  content

) =>

  request("/knowledge", {

    method:"POST",

    body: JSON.stringify({

      business_id: businessId,

      title,

      content

    })

  });



export const updateKnowledge = (

  id,

  title,

  content

) =>

  request(`/knowledge/${id}`, {

    method:"PUT",

    body: JSON.stringify({

      title,

      content

    })

  });



export const deleteKnowledge = (id) =>

  request(`/knowledge/${id}`, {

    method:"DELETE"

  });





/* ---------- Dashboard ---------- */


export const getBriefing = () =>

  request("/briefing");



export const getIntelligence = () =>

  request("/intelligence");



export const getAnalytics = () =>

  request("/analytics");





/* ---------- Messages ---------- */


export const generateMessage = (

  customer,

  interest,

  type

) =>

  request("/messages", {

    method:"POST",

    body: JSON.stringify({

      customer,

      interest,

      type

    })

  });





/* ---------- Follow Up ---------- */


export const generateFollowUpMessage = (

  customer,

  interest

) =>

  request("/follow-up-message", {

    method:"POST",

    body: JSON.stringify({

      customer,

      interest

    })

  });





export const getActivities = (customerId) =>

  request(`/activities/${customerId}`);

  /* ---------- Customer Profile ---------- */


export const getCustomerSummary = (id) =>

  request(`/customer-summary/${id}`);



export const getConversations = (id) =>

  request(`/conversations/${id}`);



export const getCustomerLead = (id) =>

  request(`/leads/customer/${id}`);



export const getNotes = (id) =>

  request(`/notes/${id}`);



export const createNote = (

  customer_id,

  note

) =>

  request("/notes", {

    method:"POST",

    body: JSON.stringify({

      customer_id,

      note

    })

  });



export const updateNote = (

  id,

  note

) =>

  request(`/notes/${id}`, {

    method:"PUT",

    body: JSON.stringify({

      note

    })

  });



export const deleteNote = (id) =>

  request(`/notes/${id}`, {

    method:"DELETE"

  });