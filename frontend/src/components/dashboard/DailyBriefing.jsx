import { useEffect, useState, useRef } from "react";
import { Sun, Sparkles } from "lucide-react";
import { getBriefing, askAssistant } from "../../api/atlasApi";
import { SkeletonText } from "../Skeleton";


function DailyBriefing() {


  const [briefing, setBriefing] = useState("");

  const [loading, setLoading] = useState(true);

  const [error, setError] = useState("");

  const [question, setQuestion] = useState("");

  const [answer, setAnswer] = useState("");

  const [asking, setAsking] = useState(false);

  const [askError, setAskError] = useState("");

  const askingRef = useRef(false);




  useEffect(()=>{


    const loadBriefing = async()=>{


      try {


        const data = await getBriefing();


        setBriefing(
          data.briefing || ""
        );


      } catch(error) {


        console.error(
          "BRIEFING ERROR:",
          error
        );


        setError(
          "Couldn't load today's briefing. Try refreshing the page."
        );


      } finally {


        setLoading(false);


      }


    };


    loadBriefing();


  },[]);


  const handleAsk = async () => {

    if (!question.trim()) {
      setAskError("Type a question first.");
      return;
    }

    if (askingRef.current) {
      return;
    }

    askingRef.current = true;
    setAsking(true);
    setAskError("");

    try {

      const data = await askAssistant(question.trim());
      setAnswer(data.answer || "");

    } catch (err) {

      console.error("ASK ASSISTANT ERROR:", err);
      setAskError(err.message || "Couldn't get an answer right now. Please try again.");

    } finally {

      askingRef.current = false;
      setAsking(false);

    }

  };

  const handleAskKeyDown = (e) => {

    if (e.key === "Enter") {
      e.preventDefault();
      handleAsk();
    }

  };




  return (

    <div className="
      h-full
      rounded-2xl
      border
      border-ink-700
      bg-ink-900/60
      p-6
    ">


      <h2 className="
        text-2xl
        font-bold
        mb-5
        flex
        items-center
        gap-2
      ">

        <Sun size={24} />
        Atlas Daily Briefing

      </h2>




      {loading ? (

        <div className="bg-ink-800 rounded-xl p-5">
          <SkeletonText lines={3} />
        </div>


      ) : error ? (

        <p className="text-red-400">

          {error}

        </p>


      ) : (

        <div className="
          bg-ink-800
          rounded-xl
          p-5
        ">


          <p className="
            whitespace-pre-wrap
          ">

            {briefing?.trim() ? briefing : "No briefing available. Try refreshing the page."}

          </p>


        </div>

      )}



      <div className="mt-4">

        <label htmlFor="ask-atlas-input" className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-500">
          Ask Atlas anything about your business
        </label>

        <div className="flex items-center gap-2">

          <input
            id="ask-atlas-input"
            placeholder="e.g. How many leads came in this week?"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={handleAskKeyDown}
            className="min-w-0 flex-1 rounded-lg border border-ink-700 bg-ink-800 p-2.5 text-sm text-white placeholder:text-slate-500 focus:border-ink-600 focus:outline-none"
          />

          <button
            onClick={handleAsk}
            disabled={asking}
            className="flex shrink-0 items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-500 disabled:opacity-50"
          >
            <Sparkles size={14} />
            {asking ? "Thinking..." : "Ask"}
          </button>

        </div>

        {askError && (
          <p className="mt-2 text-sm text-red-400">{askError}</p>
        )}

        {answer && (
          <div className="mt-3 whitespace-pre-wrap rounded-xl bg-ink-800 p-4 text-sm">
            {answer}
          </div>
        )}

      </div>



    </div>

  );


}


export default DailyBriefing;