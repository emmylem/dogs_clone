// frontend/src/App.jsx
// Complete code incorporating the setTimeout fix for initialization

import { useState, useEffect } from 'react';
import './App.css'; // Keep this import, even if the file is empty

// Define initial state clearly
const initialState = {
  validatedUser: null, // Store user data confirmed by backend
  error: '',
  isLoading: true, // Start in loading state
  rawInitData: '', // Store raw initData for sending
};

// Define backend URL (adjust if your backend runs elsewhere)
// IMPORTANT: For deployment, this needs to be your actual backend server URL, not localhost!
const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';
console.log("Using Backend URL:", BACKEND_URL); // Log to confirm which URL is used
// You can create a .env file in the 'frontend' directory with VITE_BACKEND_URL=YOUR_DEPLOYED_BACKEND_URL


function App() {
  const [state, setState] = useState(initialState);

  // --- Effect for Initialization and Validation ---
  useEffect(() => {
    console.log("App Component Mounted. Scheduling Telegram Init Check...");
    setState(prevState => ({ ...prevState, isLoading: true, error: '' })); // Reset state on mount

    const initializeMiniApp = () => {
      console.log("Running initializeMiniApp function...");
      const tg = window.Telegram?.WebApp;

      if (tg) {
        console.log("Telegram WebApp object FOUND.");
        tg.ready(); // Inform Telegram app is ready
        tg.expand(); // Expand the Mini App to full height

        const rawInitData = tg.initData;
        const initDataUnsafe = tg.initDataUnsafe; // Can still log unsafe for comparison/debug

        console.log("Raw InitData:", rawInitData);
        console.log("Unsafe InitData Object:", initDataUnsafe);


        if (!rawInitData) {
          console.error("Raw initData is missing or empty!");
          setState({
            ...initialState,
            error: "Could not retrieve initialization data from Telegram. Please restart the app.",
            isLoading: false,
          });
          return; // Stop processing
        }

        // --- Call Backend for Validation ---
        console.log(`Sending initData to backend (${BACKEND_URL}) for validation...`);
        fetch(`${BACKEND_URL}/api/auth/validate`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ initData: rawInitData }),
        })
        .then(response => {
          if (!response.ok) {
            // Try to parse error message from backend if available
            return response.json().then(errData => {
               throw new Error(errData.message || `Backend error! Status: ${response.status}`);
            }).catch(() => {
               // Fallback if parsing error response fails
               throw new Error(`Backend error! Status: ${response.status}`);
            });
          }
          return response.json(); // Parse successful JSON response
        })
        .then(data => {
          console.log("Backend validation response:", data);
          if (data.user) {
            console.log("Validation successful! User:", data.user);
            setState({
              validatedUser: data.user, // Use the user data from backend response
              error: '',
              isLoading: false,
              rawInitData: rawInitData,
            });
            // --- SUCCESS --- User is validated, app can proceed ---

          } else {
            // Backend responded OK, but didn't return a user or indicated failure
            console.error("Backend validation logic failed:", data.message);
            setState({
              ...initialState,
              error: `Backend validation failed: ${data.message || 'Unknown reason'}`,
              isLoading: false,
              rawInitData: rawInitData,
            });
          }
        })
        .catch(error => {
          console.error("Error calling backend validation:", error);
          setState({
            ...initialState,
            error: `Failed to connect or validate with backend. Please check your connection or try again later. Error: ${error.message}`,
            isLoading: false,
            rawInitData: rawInitData,
          });
        });
        // --- End Backend Call ---

      } else {
        // --- This block runs if tg object IS NOT found after delay ---
        console.error("Telegram WebApp object NOT FOUND after delay.");
         if (!window.location.href.includes('tgWebAppData')) { // Simple check if not likely inside TG
             setState({
                 ...initialState,
                 error: "This is a Telegram Mini App. Please open it through the Telegram application.",
                 isLoading: false,
             });
         } else {
             // If it seems like it *should* be in TG but object is missing, might be a load issue
              setState({
                 ...initialState,
                 error: "Telegram context still not available after delay. Please try restarting the app inside Telegram.", // Slightly updated error
                 isLoading: false,
              });
         }
      }
    };

    // Schedule the initialization check after a short delay
    const initTimeoutId = setTimeout(initializeMiniApp, 250); // 250ms delay (Adjust if needed)

    // Cleanup function to clear the timeout if the component unmounts quickly
    return () => {
      console.log("App Component Unmounting - Clearing init timeout.");
      clearTimeout(initTimeoutId);
    };

  }, []); // Empty dependency array ensures it runs only once on mount


  // --- Effect for Applying Theme ---
  const tg = window.Telegram?.WebApp; // Get instance safely for use outside initial effect
  useEffect(() => {
    // Only apply theme if user is validated AND tg object is available
    if (state.validatedUser && tg) {
      console.log("Applying Telegram theme colors");
      // Apply basic theme adjustments using CSS variables
      document.body.style.setProperty('--tg-bg-color', tg.themeParams.bg_color || '#ffffff');
      document.body.style.setProperty('--tg-text-color', tg.themeParams.text_color || '#000000');
      document.body.style.setProperty('--tg-hint-color', tg.themeParams.hint_color || '#888888');
      document.body.style.setProperty('--tg-link-color', tg.themeParams.link_color || '#007bff');
      document.body.style.setProperty('--tg-button-color', tg.themeParams.button_color || '#007bff');
      document.body.style.setProperty('--tg-button-text-color', tg.themeParams.button_text_color || '#ffffff');
      document.body.style.setProperty('--tg-secondary-bg-color', tg.themeParams.secondary_bg_color || '#eeeeee');

      // Set background color directly on body as well for immediate effect
      document.body.style.backgroundColor = tg.themeParams.bg_color || '#ffffff';
      document.body.style.color = tg.themeParams.text_color || '#000000';

    }
    // Optional: Cleanup function if needed
    // return () => { ... };
  }, [state.validatedUser, tg]); // Re-run if user data arrives or tg object reference changes


  // --- Render Logic ---
  console.log("Rendering App component with state:", state);

  // --- Loading State ---
  if (state.isLoading) {
    // Use a simple loading text, Telegram UI calls might not be ready yet
    return <div className="loading-message" style={{ padding: '20px', textAlign: 'center', color: 'var(--tg-text-color, #000)' }}>Validating session... Please wait...</div>;
  }

  // --- Error State ---
  if (state.error) {
    tg?.MainButton.setParams({ text: 'ERROR', is_visible: false }); // Hide button on error
    return (
      <div className="App error-page" style={{
          backgroundColor: 'var(--tg-secondary-bg-color, #f8d7da)', // Use theme or fallback red-ish
          color: '#721c24', // Keep error text color distinct
          padding: '20px',
          margin: '15px',
          borderRadius: '8px',
          border: '1px solid #f5c6cb'
        }}>
        <h1>Initialization Error</h1>
        <p style={{ whiteSpace: 'pre-wrap' }}>{state.error}</p>
        <p>Please try restarting the app within Telegram. If the problem persists, contact support.</p>
      </div>
    );
  }

  // --- Success State (Validated User) ---
  if (state.validatedUser) {
    // Configure Main Button (example: navigate to tasks)
    // Define handler outside to easily remove/add
    const handleMainButtonClick = () => {
        tg?.showPopup({ message: 'Navigate to Tasks section (Not Implemented Yet)' });
    };
    // Ensure previous listener is removed before adding a new one
    // Important if this effect block could re-run and tg object changes reference
    tg?.MainButton.offClick(handleMainButtonClick);
    tg?.MainButton.setParams({ text: 'VIEW DAILY TASKS', is_visible: true, is_active: true });
    tg?.MainButton.onClick(handleMainButtonClick);


    // --- Main App Layout ---
    return (
      // Apply theme colors via CSS variables defined in the effect above
      <div className="App" style={{ padding: '15px', color: 'var(--tg-text-color)' }}>

        {/* Header Welcome */}
        <header style={{ marginBottom: '20px', textAlign: 'center' }}>
          <h1 style={{ color: 'var(--tg-text-color)' }}>Welcome, {state.validatedUser.firstName || 'DOGS User'}!</h1>
          {state.validatedUser.username && <p style={{ color: 'var(--tg-hint-color)' }}>@{state.validatedUser.username}</p>}
        </header>

        {/* Token Balance Section */}
        <section className="token-balance" style={{ marginBottom: '30px', padding: '20px', backgroundColor: 'var(--tg-secondary-bg-color)', borderRadius: '10px', textAlign: 'center' }}>
          <h2 style={{ marginBottom: '10px', fontSize: '1.2em', color: 'var(--tg-text-color)' }}>Your Balance</h2>
          <p style={{ fontSize: '2.5em', fontWeight: 'bold', color: 'var(--tg-link-color)', margin: '0' }}>
            {state.validatedUser.tokens?.toLocaleString() || '0'} DOGS
          </p>
        </section>

        {/* Referral Section */}
        <section className="referral-section" style={{ marginBottom: '30px', padding: '15px', border: `1px solid var(--tg-hint-color)`, borderRadius: '8px' }}>
          <h3 style={{ marginTop: '0', marginBottom: '10px' }}>Invite Friends & Earn!</h3>
          <p style={{ fontSize: '0.9em', color: 'var(--tg-hint-color)' }}>Share your code to earn DOGS tokens for each friend who joins.</p>
          <p style={{ marginBottom: '5px' }}>Your Referral Code:</p>
          <input
            type="text"
            readOnly
            value={state.validatedUser.referralCode || 'N/A'}
            style={{
              width: 'calc(100% - 22px)', // Adjust width accounting for padding
              padding: '10px',
              border: `1px solid var(--tg-hint-color)`,
              borderRadius: '5px',
              backgroundColor: 'var(--tg-bg-color)',
              color: 'var(--tg-text-color)',
              textAlign: 'center',
              marginBottom: '10px',
              fontSize: '1.1em',
              fontWeight: 'bold',
            }}
            onClick={(e) => e.target.select()} // Select text on click
          />
          <button
            style={{
              padding: '8px 15px',
              backgroundColor: 'var(--tg-button-color)',
              color: 'var(--tg-button-text-color)',
              border: 'none',
              borderRadius: '5px',
              cursor: 'pointer',
              width: '100%', // Make button full width
              boxSizing: 'border-box' // Include padding in width calculation
            }}
            onClick={() => {
              // Attempt to get bot username dynamically if possible
               let botUsername = 'mywdogsclone_bot'; // Fallback
               try {
                   const unsafeData = window.Telegram?.WebApp?.initDataUnsafe;
                   if (unsafeData?.bot?.username) { // Look for bot username property
                      botUsername = unsafeData.bot.username;
                   }
               } catch (e) { console.error("Could not get bot username dynamically", e); }

              const referralLink = `https://t.me/${botUsername}?start=${state.validatedUser.referralCode}`;
              const shareText = 'Come join me on this cool DOGS Clone app!';

              // Use Web Share API if available (better mobile experience)
              if (navigator.share) {
                  navigator.share({
                      title: 'Join DOGS Clone!',
                      text: shareText,
                      url: referralLink,
                  }).then(() => {
                      console.log('Shared successfully');
                      tg?.showPopup({ message: 'Link shared!' });
                  }).catch((error) => {
                      console.log('Error sharing:', error);
                      if (error.name !== 'AbortError') { // Don't show popup if user cancelled share dialog
                        tg?.showPopup({ message: 'Could not share automatically.' });
                      }
                  });
              } else {
                   // Fallback for desktop or unsupported browsers - Use Telegram's share window
                   tg?.openTelegramLink(`https://t.me/share/url?url=${encodeURIComponent(referralLink)}&text=${encodeURIComponent(shareText)}`);
                   // Give feedback that something happened, as openTelegramLink doesn't have a callback
                   tg?.showPopup({ message: 'Opening share options...' });
              }
            }}
          >
            Share Your Code
          </button>
           <p style={{ fontSize: '0.9em', marginTop: '10px', color: 'var(--tg-hint-color)' }}>Friends Referred: {state.validatedUser.referralsMade || 0}</p>
        </section>

        {/* Placeholder Sections */}
        <section className="daily-tasks-placeholder" style={{ marginBottom: '20px' }}>
          <h3 style={{ borderBottom: `1px solid var(--tg-hint-color)`, paddingBottom: '5px' }}>Daily Tasks</h3>
          <p style={{ color: 'var(--tg-hint-color)' }}>(Task list coming soon! Click the button below.)</p>
        </section>

        <section className="leaderboard-placeholder" style={{ marginBottom: '20px' }}>
          <h3 style={{ borderBottom: `1px solid var(--tg-hint-color)`, paddingBottom: '5px' }}>Leaderboard</h3>
          <button disabled style={{ marginRight: '10px', cursor: 'not-allowed', opacity: 0.6, padding: '8px 12px' }}>View Top Users (Soon)</button>
        </section>

        <section className="wallet-placeholder" style={{ marginBottom: '40px' }}>
           <h3 style={{ borderBottom: `1px solid var(--tg-hint-color)`, paddingBottom: '5px' }}>Wallet</h3>
           {state.validatedUser.connectedWallet ? (
               <p style={{ color: 'var(--tg-hint-color)' }}>Wallet Connected: <span style={{ fontFamily: 'monospace', color: 'var(--tg-text-color)' }}>{state.validatedUser.connectedWallet.substring(0, 6)}...{state.validatedUser.connectedWallet.substring(state.validatedUser.connectedWallet.length - 4)}</span></p>
           ) : (
               <button disabled style={{ cursor: 'not-allowed', opacity: 0.6, padding: '8px 12px' }}>Connect TON Wallet (Soon)</button>
           )}
        </section>

        {/* Footer/Meta Info - Optional */}
        <footer style={{ textAlign: 'center', fontSize: '0.8em', color: 'var(--tg-hint-color)', marginTop: '30px', borderTop: `1px solid var(--tg-secondary-bg-color)`, paddingTop: '10px' }}>
          User ID: {state.validatedUser.userId} | v0.1.1
          {/* Raw InitData for Debug (Comment out for production) */}
          {/*
          <details>
            <summary style={{ cursor: 'pointer' }}>Debug Info</summary>
            <pre style={{ fontSize: '10px', wordBreak: 'break-all', textAlign: 'left', backgroundColor: 'var(--tg-secondary-bg-color)', padding: '5px', borderRadius: '4px', maxHeight: '100px', overflowY: 'auto' }}>
              {state.rawInitData || 'N/A'}
            </pre>
          </details>
          */}
        </footer>
      </div>
    );
  }

  // Fallback if not loading, no error, but no user
  const handleReloadClick = () => window.location.reload();
  tg?.MainButton.offClick(handleReloadClick); // Clean up previous listener
  tg?.MainButton.setParams({ text: 'RELOAD APP', is_visible: true, is_active: true });
  tg?.MainButton.onClick(handleReloadClick);
  return (
    <div className="App fallback-page" style={{ padding: '20px', textAlign: 'center', color: 'var(--tg-text-color)' }}>
      Application initialized, but no user data available. Something went wrong.
    </div>
  );
}

export default App;