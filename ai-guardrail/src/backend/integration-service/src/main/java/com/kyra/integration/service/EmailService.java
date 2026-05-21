package com.kyra.integration.service;

import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.*;
import jakarta.mail.*;
import jakarta.mail.internet.MimeMessage;

/**
 * IMAP email integration — fetch + parse inbound emails for AI processing.
 */
@Service
@Slf4j
public class EmailService {

    public record EmailMessage(String id, String from, String subject, String body,
                                String date, List<String> attachmentNames) {}

    public List<EmailMessage> fetchInbox(String host, int port, String username, String password,
                                          boolean ssl, int maxMessages) {
        List<EmailMessage> results = new ArrayList<>();
        Properties props = new Properties();
        props.put("mail.store.protocol", ssl ? "imaps" : "imap");
        props.put("mail.imap.host", host);
        props.put("mail.imap.port", String.valueOf(port));
        if (ssl) props.put("mail.imap.ssl.enable", "true");

        try {
            Session session = Session.getInstance(props);
            Store store = session.getStore(ssl ? "imaps" : "imap");
            store.connect(host, port, username, password);
            Folder inbox = store.getFolder("INBOX");
            inbox.open(Folder.READ_ONLY);

            int count = inbox.getMessageCount();
            int start = Math.max(1, count - maxMessages + 1);
            Message[] messages = inbox.getMessages(start, count);

            for (Message msg : messages) {
                String id = msg instanceof MimeMessage mm ? mm.getMessageID() : String.valueOf(msg.getMessageNumber());
                String from = msg.getFrom() != null && msg.getFrom().length > 0 ? msg.getFrom()[0].toString() : "";
                String subject = msg.getSubject() != null ? msg.getSubject() : "";
                String body = "";
                List<String> attachments = new ArrayList<>();
                try {
                    Object content = msg.getContent();
                    if (content instanceof String s) body = s;
                    else if (content instanceof Multipart mp) {
                        for (int i = 0; i < mp.getCount(); i++) {
                            BodyPart bp = mp.getBodyPart(i);
                            if (bp.getDisposition() != null && bp.getDisposition().equalsIgnoreCase(Part.ATTACHMENT)) {
                                attachments.add(bp.getFileName());
                            } else if (bp.isMimeType("text/plain")) {
                                body = bp.getContent().toString();
                            }
                        }
                    }
                } catch (Exception e) { body = "(parse error)"; }
                results.add(new EmailMessage(id, from, subject, body.substring(0, Math.min(body.length(), 2000)),
                                              msg.getSentDate() != null ? msg.getSentDate().toString() : "", attachments));
            }
            inbox.close(false);
            store.close();
        } catch (Exception e) {
            log.warn("IMAP fetch failed: {}", e.getMessage());
        }
        return results;
    }
}
