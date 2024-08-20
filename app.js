import express from 'express';
import dotenv from 'dotenv';
import { google } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
dotenv.config();

const CLIENT_ID = process.env.CLIENT_ID_ENV;
const CLIENT_SECRET = process.env.CLIENT_SECRET_ENV;
const REDIRECT_URL = 'http://localhost:3000/oauth2callback';

const oauth2Client = new OAuth2Client(CLIENT_ID, CLIENT_SECRET, REDIRECT_URL);

// Store user information
let userInfo = null;

app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/auth', (req, res) => {
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: ['https://www.googleapis.com/auth/calendar', 'https://www.googleapis.com/auth/userinfo.profile', 'https://www.googleapis.com/auth/userinfo.email']
  });
  res.redirect(authUrl);
});

app.get('/oauth2callback', async (req, res) => {
  const { code } = req.query;
  try {
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);
    
    // Fetch user information
    const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
    const userInfoResponse = await oauth2.userinfo.get();
    userInfo = userInfoResponse.data;

    console.log('User Info:', userInfo);
    
    res.redirect('/?auth=success');
  } catch (error) {
    console.error('Error getting tokens:', error);
    res.redirect('/?auth=failed');
  }
});

app.get('/auth-status', (req, res) => {
  if (userInfo) {
    res.json({ 
      authenticated: true, 
      name: userInfo.name,
      email: userInfo.email,
      picture: userInfo.picture
    });
  } else {
    res.json({ authenticated: false });
  }
});

app.post('/logout', (req, res) => {
  oauth2Client.revokeCredentials()
    .then(() => {
      userInfo = null;
      res.status(200).json({ success: true, message: 'Logged out successfully' });
    })
    .catch(error => {
      console.error('Error revoking credentials:', error);
      res.status(500).json({ success: false, error: 'Failed to logout' });
    });
});

app.get('/add-event', async (req, res) => {
  if (!userInfo) {
    return res.status(401).json({ success: false, error: 'Not authenticated' });
  }

  const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
  try {
    // Fetch the user's time zone
    const settingsResponse = await calendar.settings.get({
      setting: 'timezone'
    });
    const userTimeZone = settingsResponse.data.value;

    console.log('User time zone:', userTimeZone);

    // Create the event using the user's time zone
    const event = {
      summary: 'Exam Schedule',
      description: 'Final examination for the semester',
      start: {
        dateTime: '2024-08-20T09:00:00',
        timeZone: userTimeZone,
      },
      end: {
        dateTime: '2024-08-20T12:00:00',
        timeZone: userTimeZone,
      },
      reminders: {
        useDefault: false,
        overrides: [
          { method: 'email', minutes: 60 * 24 },  // 1 day before
          { method: 'popup', minutes: 60 * 2 },   // 2 hours before
          { method: 'popup', minutes: 30 },       // 30 minutes before
          { method: 'popup', minutes: 60 * 6 - 5 },     
        ]
      }
    };

    const result = await calendar.events.insert({
      calendarId: 'primary',
      resource: event,
      sendNotifications: true,
      sendUpdates: 'all',
    });
    
    // Verify that the event was created correctly
    const createdEvent = await calendar.events.get({
      calendarId: 'primary',
      eventId: result.data.id,
    });

    console.log('Created event:', createdEvent.data);
    console.log('Event time zone:', createdEvent.data.start.timeZone);
    console.log('Event reminders:', createdEvent.data.reminders);

    res.json({ 
      success: true, 
      eventId: result.data.id,
      eventTimeZone: createdEvent.data.start.timeZone,
      reminders: createdEvent.data.reminders 
    });
  } catch (error) {
    console.error('Error creating event:', error);
    res.status(500).json({ success: false, error: error.message });
  }

});

const PORT = 3000;
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));