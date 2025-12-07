import React from "react";
import { useNavigate } from "react-router-dom";
import IVRCard from "./IVRCard";
import "./css/IVRTab.css";
import "../shared/cards.css";

const IVRTab = () => {
  const navigate = useNavigate();

  return (
    <div className="card">
      <div className="card-header">
        <div>
          <div className="card-title">IVR System Configuration</div>
          <div className="card-description">
            Configure Interactive Voice Response settings
          </div>
        </div>
      </div>

      <div className="ivr-grid">
        <IVRCard
          title="IVR Usage"
          description="Monitor how your IVR tree performs."
          onClick={() => navigate("/ivr")}
        />
        <IVRCard
          title="Visualise IVR"
          description="View the full IVR flow in one place."
          onClick={() => navigate("/viewivr")}
          variant="blue"
        />
        <IVRCard
          title="Mass Call"
          description="Initiate bulk outreach campaigns instantly."
          onClick={() => navigate("/bulkcall")}
          variant="green"
        />
      </div>
    </div>
  );
};

export default IVRTab;
