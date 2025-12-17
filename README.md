# X-Country Tracker

A Progressive Web App for tracking cross country running progress with time, distance, and performance scoring. Supports both individual student tracking and coach dashboards for team management.

## Features

- 🏃 **Run Tracking**: Record runs with date, distance, and time
- 📊 **Score Calculation**: Automatic scoring system that normalizes different distances for comparison
- 📈 **Progress Charts**: Visual graphs showing score and pace trends over time
- 👔 **Coach Dashboard**: View all students' progress, team statistics, and rankings
- 👥 **Team Sync**: Students can join teams using team codes to sync data with coaches
- 📱 **PWA Support**: Install as an app on your device for offline use
- 💾 **Local Storage**: All data stored locally with optional Firebase cloud sync
- 🔄 **Real-time Updates**: Coaches see student runs in real-time (with Firebase)

## How to Use

### First Time Setup

1. **Choose Your Role**:
   - **Student**: Track your own running progress
   - **Coach**: View all your students' progress

2. **For Students**:
   - Enter your team code (provided by your coach)
   - Start tracking your runs
   - Your runs will sync to your coach's dashboard

3. **For Coaches**:
   - Create a new team
   - Share the team code with your students
   - View all students' progress on the dashboard

### Using the App

1. **Add a Run**:
   - Enter the date of your run
   - Input the distance in miles
   - Enter your time (minutes and seconds)
   - Click "Add Run"

2. **View Statistics**:
   - Total runs completed
   - Total distance run
   - Average pace
   - Best score achieved

3. **Track Progress**:
   - View score trends over time
   - Monitor pace improvements
   - Compare performance across different distances

4. **Coach Dashboard** (Coaches only):
   - View team overview statistics
   - See all students ranked by best score
   - Monitor individual student progress

## Score Calculation

The score is calculated using the formula: `Score = (Distance / Time) * 1000`

This system:
- Rewards both distance and speed
- Allows comparison across different distances
- Higher scores indicate better performance

## Firebase Setup (Optional - for Team Sync)

To enable team sync and coach dashboards:

1. Create a Firebase project at https://console.firebase.google.com/
2. Enable Firestore Database
3. Copy your Firebase config to `firebase-config.js`:
   ```javascript
   const firebaseConfig = {
       apiKey: "YOUR_API_KEY",
       authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
       projectId: "YOUR_PROJECT_ID",
       storageBucket: "YOUR_PROJECT_ID.appspot.com",
       messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
       appId: "YOUR_APP_ID"
   };
   ```
4. Set up Firestore security rules (see below)

### Firestore Security Rules

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Teams collection - readable by anyone with team code, writable by coaches
    match /teams/{teamCode} {
      allow read: if true; // Anyone can read team info
      allow write: if request.auth != null; // Only authenticated users (optional)
    }
    
    // Runs collection - readable by team members, writable by students
    match /runs/{runId} {
      allow read: if resource.data.teamCode == request.resource.data.teamCode;
      allow create: if request.resource.data.teamCode != null;
      allow update, delete: if request.resource.data.studentId == resource.data.studentId;
    }
  }
}
```

**Note**: For simplicity, you can start with open rules for testing:
```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if true;
    }
  }
}
```

## Installation

1. Open the app in a web browser
2. On mobile: Use "Add to Home Screen" option
3. On desktop: Use browser's install prompt

## Deployment to GitHub Pages

1. **Create a GitHub repository** for your X-Country Tracker app

2. **Upload all files** to the repository:
   - `index.html`
   - `script.js`
   - `styles.css`
   - `manifest.json`
   - `service-worker.js`
   - `firebase-config.js`
   - `icon-192.png` and `icon-512.png` (create these if needed)

3. **Configure Firebase**:
   - Edit `firebase-config.js` with your Firebase project credentials
   - Set up Firestore security rules (see Firebase Setup section above)

4. **Enable GitHub Pages**:
   - Go to repository Settings > Pages
   - Select source branch (usually `main` or `master`)
   - Select folder: `/ (root)`
   - Click Save

5. **Access your app**:
   - Your app will be available at: `https://[username].github.io/[repository-name]/`
   - The app will work as a PWA and can be installed on devices

6. **Update the app**:
   - When you make changes, update `APP_VERSION` in `service-worker.js`
   - Push changes to GitHub
   - Users will see an update banner when a new version is available

## Technical Details

- **Storage**: LocalStorage with optional Firebase Firestore sync
- **Charts**: Chart.js library
- **PWA**: Full offline support with service worker
- **Theme**: Dark red gradient matching cross country aesthetic
- **Modes**: Student mode (individual tracking) and Coach mode (team dashboard)
- **Updates**: Automatic version checking and update prompts
- **Hosting**: Designed for GitHub Pages deployment

## Version Updates

The app includes an automatic update system:
- Checks for updates every 5 minutes
- Shows update banner when new version is available
- Manual check available in Settings
- Displays current app version in Settings
- Clears cache and reloads when updating

To release an update:
1. Make your code changes
2. Update `APP_VERSION` in `service-worker.js` (e.g., '1.0.1' → '1.0.2')
3. Commit and push to GitHub
4. Users will be notified of the update automatically

## Browser Support

- iOS Safari 11.1+
- Chrome (Android & Desktop)
- Edge
- Firefox

