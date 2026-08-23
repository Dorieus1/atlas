const API = "http://localhost:5050/api";


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


    throw new Error(
      text || "API request failed"
    );


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





/* ---------- Business ---------- */


export const getBusinesses = () =>

  request("/business");





/* ---------- Customers ---------- */


export const getCustomers = () =>

  request("/customers");



export const createCustomer = (

  name,

  email

) =>

  request("/customers", {

    method: "POST",

    body: JSON.stringify({

      name,

      email

    })

  });



export const getCustomer = (id) =>

  request(`/customers/${id}`);





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