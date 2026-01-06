const dialogs = document.querySelectorAll('dialog');
const bookingForm = document.querySelector('.booking-form');
const ecofarmStartWorkTimeHour = 8
const ecofarmEndWorkTimeHour = 20
const DAYS_PERIOD_ID = 1;

let booking_identifier;
let datePicker;
let isDaylyBooking = false;

function openDialog(dialog) {
    if (typeof dialog === 'string') {
        dialog = document.querySelector(dialog)
    }

    if (!dialog)
        return

    dialog.show();
    document.body.classList.add('no-scroll');
}

function closeDialog(dialog, isRemoveNoScroll = true) {
    if (typeof dialog === 'string')
        dialog = document.querySelector(dialog)

    if (!dialog)
        return

    dialog.close();
    dialog.querySelector(".dialog__content").scrollTo(0, 0);
    if (isRemoveNoScroll)
        document.body.classList.remove('no-scroll');

    checkoutCheckboxs.classList.add('hidden')
}

function toggleDialogs(oldDialog, newDialog) {
    openDialog(newDialog)
    closeDialog(oldDialog, false)
}

dialogs.forEach(dialog => {
    const closeBtn = dialog.querySelector('.close-dialog-btn');
    const content = dialog.querySelector('.dialog__content');
    if (!closeBtn) return

    closeBtn.onclick = evt => closeDialog(dialog);
})

const openDialogBtns = document.querySelectorAll('[dialog]');
openDialogBtns.forEach(openDialogBtn => {
    const dialogId = openDialogBtn.getAttribute('dialog');
    if (!dialogId)
        return;

    const dialog = document.querySelector(`#${dialogId}`);
    if (!dialog)
        return;

    openDialogBtn.onclick = evt => openDialog(dialog)
});

const menuBtn = document.querySelector('#menu-btn');
const headerNavLinks = document.querySelector('.header-nav-links');
const navLinks = headerNavLinks.querySelectorAll('a');
const sideSocialLinks = document.querySelector('.side-social-links');

menuBtn.onclick = evt => {
    headerNavLinks.classList.toggle('menu-open');
    document.body.classList.toggle('no-scroll');
    sideSocialLinks?.classList.toggle('menu-open');
    window.scrollTo({top: 0, behavior: 'instant'});
}

navLinks.forEach(navLink => navLink.onclick = evt => {
    headerNavLinks.classList.remove('menu-open');
    document.body.classList.remove('no-scroll');
    sideSocialLinks.classList.remove('menu-open');
});

const bookingDialog = document.querySelector("#booking-dialog");
const checkoutCheckboxs = document.querySelector('#late-checkout')?.parentElement;

async function onOpenBookingDialog(
    houseName,
    bookingIdentifierId,
    periodId = undefined,
    buttonText = 'Забронировать') {
    if (!bookingDialog || !bookingIdentifierId)
        return

    const dialogTitle = bookingDialog.querySelector('.dialog__title');
    if (dialogTitle && !dialogTitle.textContent.includes(houseName))
        dialogTitle.textContent = houseName

    bookingForm?.reset();
    datePicker?.destroy()

    // для всего, что бронируется на сутки, отображаем период
    isDaylyBooking = periodId === DAYS_PERIOD_ID;
    if (isDaylyBooking) {
        checkoutCheckboxs.classList.remove('hidden')
    }

    const showTimeBtn = {
        content: 'Время',
        onClick: (datepicker) => {
            datepicker.update({timepicker: !datepicker.opts.timepicker})
        }
    }

    const addBookingBtn = document.querySelector("#add-booking-btn");
    if (addBookingBtn) {
        addBookingBtn.textContent = buttonText;
    }

    datePicker = new AirDatepicker("#date", {
        inline: false,
        minDate: getFirstPossibleDate(),
        multipleDates: 7,
        multipleDatesSeparator: isDaylyBooking ? ' - ' : ', ',
        range: isDaylyBooking,
        position: 'top center',
        minHours: ecofarmStartWorkTimeHour,
        maxHours: ecofarmEndWorkTimeHour,
        buttons: !isDaylyBooking ? [showTimeBtn, 'clear'] : ['clear'],
        onBeforeSelect: ({date, datepicker}) => {
            return !isDisabledDateIsInRange({date, datepicker});
        },
        onFocus: ({date, datepicker}) => {
            const disabledDates = [...datepicker.disabledDates].map(x => new Date(Date.parse(x)).setHours(0));
            if (isDisabledDateIsInRange({date, datepicker})
                || disabledDates.some(x => x === date.getTime())) {
                datepicker.$datepicker.classList.add('-disabled-range-')
            } else {
                datepicker.$datepicker.classList.remove('-disabled-range-')
            }
        },
        onRenderCell({date, cellType, datepicker}) {
            if (cellType === 'day') {
                const disabledDates = [...datepicker.disabledDates]
                    .map(x => new Date(Date.parse(x)).setHours(0))

                if (disabledDates.includes(date.getTime())) {
                    return {
                        disabled: true,
                        classes: 'text-line-throught',
                        attrs: {
                            title: 'Забронировано'
                        }
                    }
                }
            }
        }
    });

    openDialog(bookingDialog);

    booking_identifier = bookingIdentifierId

    const csrfToken = getCookie('csrftoken')
    const url = `/get-booked-days/${bookingIdentifierId}` + (!isDaylyBooking ? '?only_dayly=1' : '')

    try {
        const response = await fetch(url, {
            method: "GET",
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json',
                'X-CSRFToken': csrfToken
            }
        });

        const data = await response.json()
        data['booked_dates'].forEach(x => datePicker.disableDate(new Date(Date.parse(x))))

    } catch (e) {
        console.error(e.message)
    }
}

const addBookingBtn = document.querySelector('#add-booking-btn');
addBookingBtn?.addEventListener('click', evt => {
    if (!bookingForm)
        return

    evt.preventDefault()

    if (!bookingForm.checkValidity()) {
        bookingForm.reportValidity();
        return;
    }

    if (bookingForm.date.value.trim() === '') {
        return;
    }

    const formData = {
        'fio': bookingForm.fio.value,
        'phone': bookingForm.phone.value,
        'adults': bookingForm.adults.value,
        'childrens': bookingForm.childrens.value,
        'desired_dates': bookingForm.date.value.replaceAll(' 00:00', ''),
        'whatsapp': bookingForm.whatsapp.checked,
        'booking_identifier': booking_identifier,
        'is_dayly': isDaylyBooking,
        'late_checkout': isDaylyBooking ? bookingForm.lateCheckout?.checked ?? false : false,
        'early_checkin': isDaylyBooking ? bookingForm.earlyCheckin?.checked ?? false : false,
        'comment': bookingForm.comment.value
    }

    const csrfToken = getCookie('csrftoken')

    fetch('/add-booking', {
        method: "POST",
        body: JSON.stringify(formData),
        headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json',
            'X-CSRFToken': csrfToken
        }
    }).then(response => {
        if (response.ok) {
            toggleDialogs('#booking-dialog', '#booking-result-dialog--success')
        } else {
            toggleDialogs('#booking-dialog', '#booking-result-dialog--failure')
        }
    }).catch(_ => toggleDialogs('#booking-dialog', '#booking-result-dialog--failure'))

    booking_identifier = undefined;
})

const isDisabledDateIsInRange = ({date, datepicker}) => {
    const selectedDate = datepicker.selectedDates[0];
    if (datePicker.opts.range && selectedDate && datepicker.selectedDates.length === 1) {
        const sortedDates = [selectedDate, date].toSorted((a, b) => {
            if (a.getTime() > b.getTime()) {
                return 1;
            }
            return -1;
        })

        return [...datepicker.disabledDates]
            .map(date => new Date(Date.parse(date)).setHours(0))
            .some(disabledDate => sortedDates[0].getTime() <= disabledDate && disabledDate <= sortedDates[1].getTime())
    }
}

function getFirstPossibleDate() {
    const today = new Date();

    if (today.getHours() >= ecofarmEndWorkTimeHour) {
        const tommorow = new Date(today);
        tommorow.setDate(today.getDate() + 1);
        tommorow.setHours(ecofarmStartWorkTimeHour)
        return tommorow;
    }

    return today;
}

function getCookie(name) {
    let cookieValue = null;
    if (document.cookie && document.cookie !== '') {
        let cookies = document.cookie.split(';');
        for (let i = 0; i < cookies.length; i++) {
            let cookie = cookies[i].trim();
            if (cookie.substring(0, name.length + 1) === (name + '=')) {
                cookieValue = decodeURIComponent(cookie.substring(name.length + 1));
                break;
            }
        }
    }
    return cookieValue;
}