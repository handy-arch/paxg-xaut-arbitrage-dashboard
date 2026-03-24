import { NextResponse } from 'next/server';

export async function POST(request: Request) {
    try {
        const { message } = await request.json();

        const botToken = process.env.TELEGRAM_BOT_TOKEN;
        const chatId = process.env.TELEGRAM_CHAT_ID;

        if (!botToken || !chatId) {
            console.warn("Telegram credentials not configured.");
            return NextResponse.json({ success: false, error: "Missing config" }, { status: 500 });
        }

        const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: chatId,
                text: message,
                parse_mode: 'HTML'
            })
        });

        if (!response.ok) {
            throw new Error(`Telegram API responded with ${response.status}`);
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Telegram error:', error);
        return NextResponse.json({ success: false }, { status: 500 });
    }
}
