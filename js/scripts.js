// Scrol to top button

  mybutton = document.getElementById("TopBtn");

  // When the user scrolls down 20px from the top of the document, show the button
  window.onscroll = function() {scrollFunction()};

  function scrollFunction() {
    if (document.body.scrollTop > 70 || document.documentElement.scrollTop > 70) {
      mybutton.style.display = "block";
    } else {
      mybutton.style.display = "none";
    }
  }


  // When the user clicks on the button, scroll to the top of the document
  function topFunction() {
    // document.body.scrollTop = 0; // For Safari
    // document.documentElement.scrollTop = 0; // For Chrome, Firefox, IE and Opera
    $('body, html').animate({scrollTop: 0});
  }

 //Slide Sections
  // function slide(id){
  //   let target = $('#'+id);

  //   $(target).slideToggle('slow', function() {
  //     if($(target).css('display') != 'none'){
  //       $('html, body').animate({
  //         scrollTop: $(target).offset().top
  //       }, 'slow');
  //     }
  //   });

    
  // }

  function slide(id){
    let target = $('#'+id);
    var all = 

    $(".profile:not(#"+id+")").slideUp('fast', function(){
      $(target).slideDown('slow');
      $('html, body').animate({
        scrollTop: $(target).offset().top
      }, 'slow');


    });  

    
  }

  //smooth scroll
  // handle links with @href started with '#' only
  $(document).on('click', 'a[href^="#"]', function(e) {
    // target element id
    var id = $(this).attr('href');

    // target element
    var $id = $(id);
    if ($id.length === 0) {
        return;
    }

    // prevent standard hash navigation (avoid blinking in IE)
    // e.preventDefault();

    // top position relative to the document
    var pos = $id.offset().top;
    

    // animated top scrolling
    $('body, html').animate({scrollTop: pos});
  });