import json
from datetime import datetime, timedelta
from django.utils import timezone

from django.core.paginator import Paginator
from django.http import JsonResponse, HttpResponseBadRequest, HttpResponseServerError, HttpResponse
from django.shortcuts import render
from landing.models import House, AdditionalInfo, WellnessTreatment, Action, OurProduct, Event, News, Booking, OurPet, \
    ErrorLog
import traceback


def index(request):
    houses = House.objects.all()
    additional_info = AdditionalInfo.objects.all()
    wellness_treatments = WellnessTreatment.objects.all()
    actions = Action.objects.all()
    available_products = OurProduct.objects.exclude(is_available=False)[:10]
    future_events = sorted(
        filter(lambda event: event.is_passed() is False, Event.objects.all()),
        key=lambda event: event.date)[:5]
    latest_news = News.objects.all()[:5]
    our_pets = OurPet.objects.all()

    return render(
        request,
        'landing/index.html',
        {
            'houses': houses,
            'additional_info': additional_info,
            'wellness_treatments': wellness_treatments,
            'actions': actions,
            'our_products': available_products,
            'future_events': future_events,
            'news': latest_news,
            'our_pets': our_pets
        })


def events(request):
    events_qs = Event.objects.all()
    future_events = sorted(filter(lambda event: event.is_passed() is False, events_qs), key=lambda event: event.date)
    past_events = sorted(filter(lambda event: event.is_passed() is True, events_qs), key=lambda event: event.date)

    return render(request, "landing/events.html", {
        'future_events': future_events,
        'past_events': past_events[:10]
    })


def news(request):
    all_news = News.objects.all()
    paginator = Paginator(all_news, 5)

    page_number = request.GET.get('page') or 1
    news_page = paginator.get_page(page_number)

    return render(
        request,
        'landing/news.html',
        {'news': news_page})


def our_products(request):
    all_products = OurProduct.objects.all()
    return render(
        request,
        'landing/our-products.html',
        {'products': all_products})


def add_booking(request):
    if not request.method == 'POST':
        return HttpResponseBadRequest("The request type must be POST")

    if not request.body:
        message = "The request body is empty"
        add_log_to_db(message)

        return HttpResponseBadRequest(message)

    form_data = None
    try:
        decoded_body = request.body.strip().decode('utf-8')
        form_data = json.loads(decoded_body)

        late_checkout = bool(form_data.get('late_checkout', False))
        early_checkin = bool(form_data.get('early_checkin', False))

        new_booking = Booking(
            fio=form_data['fio'],
            phone_number=form_data['phone'],
            adults_count=form_data['adults'],
            childs_count=form_data['childrens'],
            desired_dates=form_data['desired_dates'],
            booking_identifier_id=form_data['booking_identifier'],
            is_has_whatsapp=form_data['whatsapp'],
            is_dayly=form_data['is_dayly'],
            is_late_checkout=late_checkout,
            is_early_checkin=early_checkin,
            user_comment=form_data['comment']
        )
        new_booking.save()
    except Exception as e:
        err_message = "An error occured while saving new booking: " + str(e)
        add_log_to_db(err_message, traceback.extract_stack(), form_data)

        return HttpResponseServerError(err_message)

    return HttpResponse(status=201)


def get_booked_days(request, booking_identifier_id):
    if not booking_identifier_id or booking_identifier_id == 0:
        message = 'booking_identifier is empty'
        add_log_to_db(message)
        return HttpResponseBadRequest(message)

    booked_dates = set()

    try:
        get_bookings_query = Booking.objects \
                        .filter(booking_identifier_id=booking_identifier_id) \
                        .filter(date_create__lt=timezone.now()) \
                        .filter(status='b') \
                        .values('desired_dates', 'date_start_fact', 'date_end_fact', 'is_late_checkout')

        if 'only_dayly' in request.GET:
            get_bookings_query = get_bookings_query.filter(is_dayly=True)

        bookings = list(get_bookings_query)

        for booking in bookings:
            if booking['date_start_fact'] and booking['date_end_fact']:
                fact_booked_dates = get_all_dates_in_range(
                    booking['date_start_fact'],
                    booking['date_end_fact'],
                    booking['is_late_checkout'])
                booked_dates.update(fact_booked_dates)
            elif booking['date_start_fact']:
                parsed_date = get_parsed_date(booking['date_start_fact'])
                if parsed_date is not None:
                    booked_dates.add(parsed_date)
            elif booking['desired_dates'] and '-' in booking['desired_dates']:
                dates_arr = booking['desired_dates'].split('-')
                if len(dates_arr) == 2:
                    fact_booked_dates = get_all_dates_in_range(dates_arr[0], dates_arr[1], booking['is_late_checkout'])
                    booked_dates.update(fact_booked_dates)
            else:
                desired_dates = booking['desired_dates'].split(',')
                for date_str in desired_dates:
                    date = get_parsed_date(date_str)
                    if date is not None:
                        booked_dates.add(date)
    except Exception as e:
        message = "failed to get booked days: " + str(e)
        add_log_to_db(message, traceback.extract_stack(), request.GET)

    booked_dates_str = set([get_string_from_date(date) for date in booked_dates])

    return JsonResponse({'booked_dates': list(booked_dates_str)})


def get_all_dates_in_range(date_start_str, date_end_str, is_include_last=False):
    date_start = get_parsed_date(date_start_str)
    date_end = get_parsed_date(date_end_str)

    if date_start is None or date_end is None:
        return []

    dates_in_range = []
    while date_start < date_end:
        dates_in_range.append(date_start)
        date_start += timedelta(days=1)

    if is_include_last:
        dates_in_range.append(date_end)

    return dates_in_range


date_time_formats = ['%d.%m.%Y %H:%M', '%d.%m.%Y']
def get_parsed_date(date):
    if isinstance(date, datetime):
        return date
    if not isinstance(date, str):
        return None

    for date_time_format in date_time_formats:
        try:
            parsed_date = datetime.strptime(date.strip(), date_time_format)
            return parsed_date
        except ValueError:
            continue

    return None


def get_string_from_date(date):
    try:
        return date.strftime('%Y.%m.%d')
    except Exception:
        return ""


def add_log_to_db(message, stack_trace=None, additional=None):
    payload = None
    try:
        payload = additional if isinstance(additional, str) else json.dumps(additional)
    except Exception:
        pass

    try:
        error_log = ErrorLog(
            error_message=message,
            stack_trace=str(stack_trace),
            additional_info=str(additional)
        )
        error_log.save()
    except Exception as e:
        print("Failed to save ErrorLog: " + str(e))