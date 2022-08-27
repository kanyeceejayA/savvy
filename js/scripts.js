// Scroll to top button

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
    $('body, html').animate({scrollTop: 0}, 'EaseinOutQuad');
  }

 //Slide Sections

  function slide(id){
    let target = $('#'+id);
    let overlay = $('.'+id+' > .overlay');

    overlay.animate({opacity: 0}, 500);
    // $(":not(."+id+") >.overlay").show();
    $(":not(."+id+") >.overlay").animate({opacity: 1}, 500);
    
    $(".profile:not(#"+id+")").hide(1, function(){

      $(target).slideDown('slow');
      //  function(){

        if ($(window).width() < 1200){
          $('html, body').animate({
            scrollTop: $(target).offset().top
          }, 'slow', 'easeInOutQuad');
        }else{
          $('html, body').animate({
            scrollTop: $('.'+id).offset().topA
          }, 'slow', 'easeInOutQuad');
        }

      // });

    });
  } 
    

  function slide2(id){
    let target = $('#'+id);

    $(".service:not(#"+id+")").fadeOut('fast', function(){
      $(target).fadeIn('slow');
      $('html, body').animate({
        scrollTop: $(target).offset().top
      }, 'slow', 'easeInOutQuad');


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
    e.preventDefault();

    // top position relative to the document
    var pos = $id.offset().top;
    

    // animated top scrolling
    $('body, html').animate({scrollTop: pos},'slow','easeInOutQuad');
  });

  // Read More Function 
  $("#toggle").click(function() {
    var elem = $("#toggle").text();
    if (elem == "▼ Read More") {
      //Stuff to do when btn is in the read more state
      $("#toggle").text("▲ Read Less");
      $(".more").slideDown();
    } else {
      //Stuff to do when btn is in the read less state
      $("#toggle").text("▼ Read More");
      $(".more").slideUp();
    }
  });

  document.addEventListener("DOMContentLoaded", function() {
    document.getElementById("year").innerHTML = (new Date().getFullYear());
  });