const EventEmitter = require("events");
const asyncModule = require("async");
const { DeepgramAgent, EVENTS: DeepgramAgentEvents } = require("./deepgramagent");
const DeeplTransAgent = require("./DeeplTransAgent");
const T2SAgent = require("./T2SAgent");

const EVENTS = {
    PROCESS_COMPLETED: "PROCESS_COMPLETED", // a part of speech recognized, translated, new speech generated
};

/**
* Manage interaction between S2T, Translation, T2S services
* for given SSRC
*/
class RickyAgency {
    constructor(ssrc) {
        this.ssrc = ssrc;
        this.eventEmitter = new EventEmitter();
        this.s2t_agent = new DeepgramAgent();
        // this.sentence_queue = [] // array of recognized sentences
        this.is_running = true;
        this.t2s_agent = new T2SAgent();

        this.listenerStatic = {}; // lang-num key pair of listners
        this.process_queues = {}; // lang - async task queue key pair

        // connect events
        this.s2t_agent.eventEmitter.on(DeepgramAgentEvents.SPEECH_RECOGNIZED, (data) => {
            // add a task to all existing queues for different lang
            for (const lang in this.process_queues) {
                console.log("lang: ", lang);

                // Add new task to queue
                this.process_queues[lang].push({ text: data.text }, (err, obj) => {
                    if (err == null) {
                        console.log("original: ", obj.original);
                        console.log("trans: ", obj.text);
                        this.eventEmitter.emit(EVENTS.PROCESS_COMPLETED, lang, obj);
                    } else {
                        console.log("process err:", err);
                    }
                });
            }
        });
    }


    async addListner(listners_lang) {
        if (this.listenerStatic.hasOwnProperty(listners_lang)) {
            this.listenerStatic[listners_lang] += 1;
        } else {
            this.listenerStatic[listners_lang] = 0;
            this.process_queues[listners_lang] = asyncModule.queue(async (task, completed) => {
                try {
                    let s = task.text.trim();
                    if (s == "") {
                        throw new Error("Empty String");
                    }
                    // Parallel Operations: Fetch translation and audio concurrently using Promise.all to reduce waiting time.
                    const [translationRes, audioRes] = await Promise.all([
                        DeeplTransAgent.translateTo(text, listners_lang),
                        this.t2s_agent.generateAudio(text, listners_lang),
                    ]);

                    if (translationRes.statusCode !== 200) {
                        throw new Error('Translation failed');
                    }

                    const translatedText = translationRes.body.translations[0].text;
                    const audio = audioRes[0].audioContent.toString('base64');

                    completed(null, {
                        original: text,
                        text: translatedText,
                        sound: audio,
                        order: task.order,
                    });

                    // DeeplTransAgent.translateTo(s, listners_lang)
                    //     .then((res) => {
                    //         if (res.statusCode !== 200) {
                    //             throw new Error("Trans failed");
                    //         }
                    //         return res.body.translations[0].text;
                    //     })
                    //     .then((translatedTxt) => {
                    //         return this.t2s_agent
                    //             .generateAudio(translatedTxt, listners_lang)
                    //             .then((res) => ({ translatedTxt, audio: res[0].audioContent.toString("base64") }));
                    //     })
                    //     .then(({ translatedTxt, audio }) => {
                    //         const obj = {
                    //             original: s,
                    //             text: translatedTxt,
                    //             sound: audio,
                    //             order: task.order,
                    //         };
                    //         completed(null, obj);
                    //     })
                    //     .catch((err) => {
                    //         completed(err, null);
                    //     });
                } catch (error) {
                    console.log("catch worked");
                    completed(error, null);
                }
            }, 1);
        }
    }


    removeListner(listners_lang) {
        if (this.listenerStatic.hasOwnProperty(listners_lang)) {
            this.listenerStatic[listners_lang] -= 1;

            // if all listeners for a specific lang were removed,
            // then kill the task queue
            if (this.listenerStatic[listners_lang] < 1) {
                this.process_queues[listners_lang].kill();
                delete this.process_queues[listners_lang];
                delete this.listenerStatic[listners_lang];
            }
        }
    }

    sendSpeechData(buff) {
        // check if there is any listener
        if (this.hasAnyListener()) {
            this.s2t_agent.send(buff);
        }
        // console.log('s2t_state: ', this.s2t_agent.isConnectionOpen)
    }

    hasAnyListener() {
        return Object.keys(this.listenerStatic).length > 0;
    }
}



module.exports = {
    RickyAgency,
    EVENTS,
};