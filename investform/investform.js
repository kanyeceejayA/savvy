$(function () {

// init the validator
// validator files are included in the download package
// otherwise download from http://1000hz.github.io/bootstrap-validator

// $('#invest-form').validator();




// when the form is submitted
$('#invest-form').on('submit', function (e) {
    console.log('form submited');

    $( "#send" ).addClass( "onclick", 1000);
 
    e.preventDefault();

    grecaptcha.ready(function () {
        grecaptcha.execute('6LePM7AZAAAAAKapK_1K211nv8PmD-zhzhL2l6Sq', { action: 'invest' }).then(function (token) {
            var recaptchaResponse = document.getElementById('recaptchaResponse2');
            recaptchaResponse.value = token;
        });
    });
    

    var url = "investform/investform.php";

    // POST values in the background the the script URL
    $.ajax({
        type: "POST",
        url: url,
        data: $(this).serialize(),
        success: function (data)
        {
            // data = JSON object that contact.php returns

            // we recieve the type of the message: success x danger and apply it to the 
            var messageAlert = 'alert-' + data.type;
            var messageText = data.message;

            // let's compose Bootstrap alert box HTML
            var alertBox = '<div class="alert ' + messageAlert + ' alert-dismissable"><button type="button" class="close" data-dismiss="alert" aria-hidden="true">&times;</button>' + messageText + '</div>';
            
            // If we have messageAlert and messageText
            if (messageAlert && messageText) {
                // inject the alert to .message div in our form
                // $('#invest-form').find('.message').html(alertBox);
                document.getElementById("message").innerHTML = alertBox;
                // alert(alertBox);

                // empty the form
                if(data.type == 'success'){
                    console.log('it was a success');
                    $('#invest-form')[0].reset();

                    $( "#send" ).removeClass( "onclick" );
                    $( "#send" ).addClass( "done", 450, callbacksubmit2() );
                }
                else{
                    $( "#send" ).removeClass( "onclick" );
                    $( "#send" ).addClass( "fail", 450, callbacksubmit2() );   
                }
            }
        }
    });
    return false;

})
});


function callbacksubmit2() {
setTimeout(function() {
    $( "#send" ).removeClass( "done" );
    $( "#send" ).removeClass( "fail" );
}, 1500 );
}
