import React from 'react';
import { Calendar, ShieldCheck, AlertTriangle } from 'lucide-react';

const Hero: React.FC = () => {
  return (
    <div className="text-center pt-12 pb-6 px-4 sm:px-6 lg:px-8">
      <div className="flex justify-center items-center mb-6">
        <div className="bg-[#00076F] p-4 rounded-2xl shadow-xl">
          <Calendar className="h-10 w-10 text-white" />
        </div>
      </div>
      
      <h1 className="text-4xl font-extrabold tracking-tight text-gray-900 sm:text-5xl md:text-6xl">
        AI Calendaring Clerk
      </h1>
      
      <p className="mt-6 max-w-2xl mx-auto text-base text-gray-500 sm:text-lg md:text-xl leading-relaxed">
        Upload a PDF document containing dates to be calendered, like a court scheduling order. 
        The system will extract all the dates and give you the ability to add them to the case management system.
      </p>

      {/* Warning Block */}
      <div className="mt-8 max-w-2xl mx-auto p-4 bg-yellow-50 border border-yellow-200 rounded-lg flex items-center justify-center gap-3 text-center">
        <AlertTriangle className="h-5 w-5 text-yellow-600 flex-shrink-0" />
        <p className="text-sm text-yellow-800">
          AI can make mistakes, double check the output for accuracy and completeness.
        </p>
      </div>

      <div className="mt-8 flex justify-center space-x-2 text-sm text-gray-400">
        <span className="flex items-center"><ShieldCheck className="w-4 h-4 mr-1" /> Secure Document Analysis</span>
        <span>•</span>
        <span>Powered by Gemini from Google</span>
      </div>
    </div>
  );
};

export default Hero;