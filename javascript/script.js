const mainMenu =  document.querySelector(".main-menu");
const open = document.querySelector('.open');
const close = document.querySelector('.close');

open.addEventListener('click', () =>{
    mainMenu.style.display = "flex";
    close.style.display = 'block'
    open.style.display = 'none'
})

close.addEventListener('click', () =>{
    mainMenu.style.display = "none";
    close.style.display = 'none'
    open.style.display = 'flex'
})
