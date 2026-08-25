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



// Shared by both the owner and portal PDF downloads below - a plain <a
// href> can't attach an Authorization header, so this fetches the file
// as a blob with the right token first, then hands the browser a
// throwaway object URL to save it through the normal download UI.
async function downloadFile(path, tokenKey) {

  const token = localStorage.getItem(tokenKey);

  const response = await fetch(`${API}${path}`, {

    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    }

  });

  if (!response.ok) {

    handleSessionExpired(response);
    throw new Error("Couldn't download that file. Please try again.");

  }

  const disposition = response.headers.get("Content-Disposition") || "";
  const match = disposition.match(/filename="(.+)"/);
  const filename = match ? match[1] : "download";

  const blob = await response.blob();
  const url = URL.createObjectURL(blob);

  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();

  URL.revokeObjectURL(url);

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



export const inviteTeammate = (name, email, password, role) =>

  request("/auth/teammates", {

    method: "POST",

    body: JSON.stringify({

      name,

      email,

      password,

      role

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



export const importCustomersCsv = async (file) => {

  const token = localStorage.getItem("token");

  const formData = new FormData();

  formData.append("file", file);

  const response = await fetch(`${API}/customers/import`, {

    method: "POST",

    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },

    body: formData

  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {

    handleSessionExpired(response);

    throw new Error(data.error || "Import failed");

  }

  return data;

};



export const getTrashedCustomers = () =>

  request("/customers/trash");



export const restoreCustomer = (id) =>

  request(`/customers/${id}/restore`, {

    method: "POST"

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

  end_time,

  recurrence,

  occurrences

) =>

  request("/appointments", {

    method:"POST",

    body: JSON.stringify({

      customer_id,

      title,

      notes,

      start_time,

      end_time,

      recurrence,

      occurrences

    })

  });



// scope: "this" (default, single row) or "future" (this and every later
// occurrence in the same recurring series).
export const updateAppointmentStatus = (id, status, scope) =>

  request(`/appointments/${id}`, {

    method:"PATCH",

    body: JSON.stringify({ status, scope })

  });



// scope: "this" (default, single row) or "future" (this and every later
// occurrence in the same recurring series).
export const deleteAppointment = (id, scope) =>

  request(`/appointments/${id}`, {

    method:"DELETE",

    body: JSON.stringify({ scope })

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



export const downloadQuotePdf = (id) =>

  downloadFile(`/quotes/${id}/pdf`, "token");



export const exportQuotesCsv = (filters = {}) => {

  const params = new URLSearchParams();

  if (filters.type) {
    params.set("type", filters.type);
  }

  if (filters.status) {
    params.set("status", filters.status);
  }

  const query = params.toString();

  return downloadFile(`/quotes/export.csv${query ? `?${query}` : ""}`, "token");

};



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



export const draftEstimateFromPhoto = (id) =>

  request(`/photos/${id}/draft-estimate`, {

    method:"POST"

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



/* ---------- Customer portal ---------- */


// A separate request helper, not the shared one above - the portal uses
// its own "portal_token" in localStorage rather than the business
// owner's "token", so a device that's both an owner and a browsing
// customer never has one session clobber the other.
const portalRequest = async (path, options = {}) => {

  const token = localStorage.getItem("portal_token");

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

};


export const getPortalBusiness = (slug) =>
  portalRequest(`/portal/${slug}`);

export const requestPortalLogin = (slug, email) =>
  portalRequest(`/portal/${slug}/login`, {
    method:"POST",
    body: JSON.stringify({ email })
  });

export const verifyPortalLogin = (slug, token) =>
  portalRequest(`/portal/${slug}/verify`, {
    method:"POST",
    body: JSON.stringify({ token })
  });

export const getPortalMe = () =>
  portalRequest("/portal/account/me");

export const getPortalAppointments = () =>
  portalRequest("/portal/account/appointments");

export const requestPortalAppointment = (title, notes, start_time, end_time) =>
  portalRequest("/portal/account/appointments", {
    method:"POST",
    body: JSON.stringify({ title, notes, start_time, end_time })
  });

export const getPortalQuotes = () =>
  portalRequest("/portal/account/quotes");

export const createInvoiceCheckout = (quoteId) =>
  portalRequest(`/portal/account/quotes/${quoteId}/checkout`, {
    method:"POST"
  });

export const downloadPortalQuotePdf = (quoteId) =>
  downloadFile(`/portal/account/quotes/${quoteId}/pdf`, "portal_token");

export const getPortalPhotos = () =>
  portalRequest("/portal/account/photos");



/* ---------- Online payments (Stripe Connect) ---------- */


export const getStripeConnectStatus = () =>
  request("/stripe/connect/status");

export const startStripeOnboarding = () =>
  request("/stripe/connect/start", {
    method:"POST"
  });



/* ---------- Search ---------- */


export const search = (query) =>
  request(`/search?q=${encodeURIComponent(query)}`);



/* ---------- Knowledge gaps (AI-suggested knowledge entries) ---------- */


export const getKnowledgeGaps = () =>
  request("/knowledge-gaps");

export const approveKnowledgeGap = (id, title, content) =>
  request(`/knowledge-gaps/${id}/approve`, {
    method:"POST",
    body: JSON.stringify({ title, content })
  });

export const dismissKnowledgeGap = (id) =>
  request(`/knowledge-gaps/${id}/dismiss`, {
    method:"POST"
  });



/* ---------- Saved line items (quick-add services catalog) ---------- */


export const getSavedLineItems = () =>
  request("/saved-line-items");

export const createSavedLineItem = (description, unit_price) =>
  request("/saved-line-items", {
    method:"POST",
    body: JSON.stringify({ description, unit_price })
  });

export const updateSavedLineItem = (id, description, unit_price) =>
  request(`/saved-line-items/${id}`, {
    method:"PUT",
    body: JSON.stringify({ description, unit_price })
  });

export const deleteSavedLineItem = (id) =>
  request(`/saved-line-items/${id}`, {
    method:"DELETE"
  });



/* ---------- Tags (customer segmentation) ---------- */


export const getTags = () =>
  request("/tags");

export const createTag = (name) =>
  request("/tags", {
    method: "POST",
    body: JSON.stringify({ name })
  });

export const deleteTag = (id) =>
  request(`/tags/${id}`, {
    method: "DELETE"
  });

export const addCustomerTag = (customerId, tagId) =>
  request(`/customers/${customerId}/tags`, {
    method: "POST",
    body: JSON.stringify({ tag_id: tagId })
  });

export const removeCustomerTag = (customerId, tagId) =>
  request(`/customers/${customerId}/tags/${tagId}`, {
    method: "DELETE"
  });