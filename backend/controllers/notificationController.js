const {
  getNotifications: getNotificationsService,
  getUnreadCount: getUnreadCountService,
  markAsRead: markAsReadService,
  markAllAsRead: markAllAsReadService
} = require("../services/notificationService");



const getNotifications = async (req, res) => {

  try {

    const notifications = await getNotificationsService(req.user.business_id);

    res.json(notifications);

  } catch (error) {

    console.error(error);

    res.status(500).json({
      error: "Something went wrong. Please try again."
    });

  }

};



const getUnreadCount = async (req, res) => {

  try {

    const count = await getUnreadCountService(req.user.business_id);

    res.json({ count });

  } catch (error) {

    console.error(error);

    res.status(500).json({
      error: "Something went wrong. Please try again."
    });

  }

};



const markAsRead = async (req, res) => {

  try {

    const updated = await markAsReadService(req.params.id, req.user.business_id);

    if (!updated) {

      return res.status(404).json({
        error: "Notification not found"
      });

    }

    res.json({ message: "Marked as read" });

  } catch (error) {

    console.error(error);

    res.status(500).json({
      error: "Something went wrong. Please try again."
    });

  }

};



const markAllAsRead = async (req, res) => {

  try {

    await markAllAsReadService(req.user.business_id);

    res.json({ message: "All marked as read" });

  } catch (error) {

    console.error(error);

    res.status(500).json({
      error: "Something went wrong. Please try again."
    });

  }

};



module.exports = {

  getNotifications,

  getUnreadCount,

  markAsRead,

  markAllAsRead

};
