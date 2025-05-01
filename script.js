// Payment Logic
document.getElementById('pay').addEventListener('click', async () => {
  let phone = document.getElementById('phone').value.trim();
  const status = document.getElementById('status');

  // Direct access for admin phone number
  if (phone === '0796029616') {
    localStorage.setItem('phone', phone);
    status.textContent = 'Welcome admin! Redirecting to admin page...';
    window.location.href = 'https://perontips-backend.onrender.com/logs?phone=0796029616';
    return;
  }

  // Convert 07XXXXXXXX to 2547XXXXXXXX
  if (phone.startsWith('07') && phone.length === 10) {
    phone = '254' + phone.slice(1);
  }

  if (!phone.startsWith('2547') || phone.length !== 12) {
    status.textContent = 'Enter a valid Kenyan phone number (07XXXXXXXX)';
    return;
  }

  status.textContent = 'Processing payment...';

  try {
    const response = await fetch('https://perontips-backend.onrender.com/pay', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone })
    });

    const result = await response.json();

    if (result.success) {
      status.textContent = 'STK Push sent. Waiting for confirmation...';
      localStorage.setItem('phone', phone);

      let attempts = 0;
      const interval = setInterval(async () => {
        attempts++;
        const confirmed = await checkPaymentStatus(phone);
        if (confirmed || attempts >= 12) {
          clearInterval(interval);
          if (!confirmed) {
            status.textContent = 'Payment not confirmed after 1 minute. Try again.';
            localStorage.removeItem('phone');
            localStorage.removeItem('vipExpiry');
          }
        }
      }, 5000);
    } else {
      status.textContent = 'Payment failed. Try again.';
    }
  } catch (error) {
    status.textContent = 'Error processing payment.';
    console.error(error);
  }
});

async function checkPaymentStatus(phone) {
  const status = document.getElementById('status');

  try {
    const response = await fetch(`https://perontips-backend.onrender.com/vip-access/${phone}`);
    const result = await response.json();

    if (result.access === true && result.redirect?.startsWith('http')) {
      const expiryTime = Date.now() + 5 * 60 * 60 * 1000;
      localStorage.setItem('vipExpiry', expiryTime.toString());
      localStorage.setItem('phone', phone);

      status.textContent = 'Payment confirmed! Redirecting...';
      window.location.href = result.redirect;
      return true;
    } else {
      status.textContent = 'Still waiting for payment confirmation...';
      return false;
    }
  } catch (error) {
    status.textContent = 'Failed to check payment status.';
    console.error(error);
    return false;
  }
}

// Comment Logic
const COMMENT_API = 'https://comment-backend-7w97.onrender.com/api/comment';

document.getElementById('commentForm').addEventListener('submit', async function (e) {
  e.preventDefault();
  const message = document.getElementById('message').value.trim();
  const status = document.getElementById('commentStatus');

  if (!message) {
    status.textContent = 'Please type a comment.';
    return;
  }

  status.textContent = 'Sending...';

  try {
    const res = await fetch(COMMENT_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message })
    });

    const data = await res.json();

    if (res.ok && data.success) {
      status.textContent = 'Comment sent!';
      document.getElementById('message').value = '';
    } else {
      status.textContent = 'Error: ' + (data.message || 'Unknown error');
    }
  } catch (err) {
    status.textContent = 'Network error: ' + err.message;
  }
});
