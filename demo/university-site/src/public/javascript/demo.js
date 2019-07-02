

(function(){

  function handleServiceErrors(response) {
    if (response.ok) return response;
    throw response;
  }

  login_form.addEventListener('submit', function(e){
    e.preventDefault();
    this.setAttribute('spin', '');
    setTimeout(function(){
      login_form.removeAttribute('spin');
      dashboard_wrapper.setAttribute('logged-in', '');
    }, 2000);
  })

  var qrcode = new QRCode(qr_output);

  fetch('/auth-selfissue')
    .then(handleServiceErrors)
    .then(function(response) {
        response.text().then(function(authRequest) {
          // present the QR code to the user
          qrcode.makeCode(authRequest);
        })
    })
    .catch(function(e) {
      console.log(e);
    });

})()