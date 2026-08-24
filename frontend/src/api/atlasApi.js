export const API_BASE =
  import.meta.env.VITE_API_URL ||
  `http://${window.location.hostname}:5050`;

const API = `${API_BASE}/api`;


// Shared by request() below and by the handful of components that still
// make their own fetch() calls directly. A 401 on an authenticated
// request means the session itself is invalid - reset auth state and
// send the user back to a clean login instead of leaving them staring
// at a broken screen. Returns true if it handled a session-expired
// response, so callers know to stop processing.
export function handleSessionExpired(response) {

  const token = localStorage.getItem("token");

  if (response.status === 401 && token) {

    localStorage.removeItem("token");
    localStorage.removeItem("business_id");
    localStorage.removeItem("user");

    if (window.location.pathname !== "/login") {

      window.location.href = "/login";

    }

    return true;

  }

  return false;

}


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


    handleSessionExpired(response);


    const text = await response.text();

    let message = text;

    try {

      const parsed = JSON.parse(text);

      if (parsed && parsed.error) {
        message = parsed.error;
      }

    } catch (parseError) {

      // Not JSON - fall back to the raw response text below.

    }


    const error = new Error(
      message || "API request failed"
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



/* ---------- Appointments ---------- */


export const getAppointments = () =>

  request("/appointments");



export const getCustomerAppointments = (customerId) =>

  request(`/appointments/customer/${customerId}`);



export const createAppointment = (

  customer_id,

  title,

  notes,

  start_time,

  end_time

) =>

  request("/appointments", {

    method:"POST",

    body: JSON.stringify({

      customer_id,

      title,

      notes,

      start_time,

      end_time

    })

  });



export const updateAppointmentStatus = (id, status) =>

  request(`/appointments/${id}`, {

    method:"PATCH",

    body: JSON.stringify({ status })

  });



export const deleteAppointment = (id) =>

  request(`/appointments/${id}`, {

    method:"DELETE"

  });



/* ---------- Quotes & Invoices ---------- */


export const getQuotes = () =>

  request("/quotes");



export const getCustomerQuotes = (customerId) =>

  request(`/quotes/customer/${customerId}`);



export const getQuote = (id) =>

  request(`/quotes/${id}`);



export const createQuote = (customer_id, type, notes, items) =>

  request("/quotes", {

    method:"POST",

    body: JSON.stringify({

      customer_id,

      type,

      notes,

      items

    })

  });



export const updateQuote = (id, fields) =>

  request(`/quotes/${id}`, {

    method:"PATCH",

    body: JSON.stringify(fields)

  });



export const deleteQuote = (id) =>

  request(`/quotes/${id}`, {

    method:"DELETE"

  });



/* ---------- Photos ---------- */


export const getCustomerPhotos = (customerId) =>

  request(`/photos/customer/${customerId}`);



export const uploadPhoto = async (customerId, file, caption) => {

  const token = localStorage.getItem("token");

  const formData = new FormData();

  formData.append("customer_id", customerId);
  formData.append("photo", file);

  if (caption) {
    formData.append("caption", caption);
  }

  const response = await fetch(`${API}/photos`, {

    method: "POST",

    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },

    body: formData

  });

  if (!response.ok) {

    handleSessionExpired(response);

    const data = await response.json().catch(() => ({}));

    throw new Error(data.error || "Upload failed");

  }

  return response.json();

};



export const deletePhoto = (id) =>

  request(`/photos/${id}`, {

    method:"DELETE"

  });



/* ---------- Review Requests ---------- */


export const sendReviewRequest = (customer_id) =>

  request("/review-requests", {

    method:"POST",

    body: JSON.stringify({ customer_id })

  });



export const getCustomerReviewRequests = (customerId) =>

  request(`/review-requests/customer/${customerId}`);



/* ---------- Public chat page ---------- */


export const getPublicBusiness = (slug) =>

  request(`/public/${slug}`);



export const startPublicConversation = (slug, name, email, phone) =>

  request(`/public/${slug}/start`, {

    method:"POST",

    body: JSON.stringify({ name, email, phone })

  });



export const sendPublicMessage = (slug, customer_id, message) =>

  request(`/public/${slug}/chat`, {

    method:"POST",

    body: JSON.stringify({ customer_id, message })

  });



export const getPublicHistory = (slug, customerId) =>

  request(`/public/${slug}/conversations/${customerId}`);



/* ---------- Notifications ---------- */


export const getNotifications = () =>

  request("/notifications");



export const getUnreadNotificationCount = () =>

  request("/notifications/unread-count");



export const markNotificationRead = (id) =>

  request(`/notifications/${id}/read`, {

    method:"PATCH"

  });



export const markAllNotificationsRead = () =>

  request("/notifications/read-all", {

    method:"PATCH"

  });



/* ---------- Getting started checklist ---------- */


export const getOnboardingStatus = () =>

  request("/onboarding/status");



export const dismissOnboarding = () =>

  request("/onboarding/dismiss", {

    method:"PATCH"

  });