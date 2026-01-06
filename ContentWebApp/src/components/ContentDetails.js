import React, { useState, useEffect, useCallback } from "react";
import { useParams } from "react-router-dom";
import QuizDetails from "./QuizDetails";
import StoryDetails from "./StoryDetails";
import { SEEDS_URL } from "../Constants";

const ContentDetails = () => {
  const { type, id } = useParams();
  const [content, setContent] = useState(null);

  const contentById = useCallback(async () => {
    console.log("CONTENTBYID", type);
    // console.log(type)
    // const res = await fetch("http://localhost:5001/content");

    try {
      let data;
      if (type === "quiz") {
        const placeRes = await fetch(
          "https://place-seeds.azurewebsites.net/rawDataById?" +
            new URLSearchParams({
              id: id,
            })
        );
        data = await placeRes.json();
        console.log("ContentDetailsData", data);
      } else {
        const seedsRes = await fetch(`${SEEDS_URL}/content/${id}`, {
          method: "GET",
          headers: getAuthHeaders(),
        });
        data = await seedsRes.json();
        console.log("ContentDetailsData1", data);
      }
      setContent(data);
      return data;
    } catch (error) {
      console.error("Error fetching content:", error);
      return null;
    }
  }, [type, id]);

  useEffect(() => {
    const fetchContent = async () => {
      await contentById();
    };
    fetchContent();
  }, [contentById]);

  if (content && !content.isProcessed) {
    return (
      <>
        <div style={{ margin: "20px" }}>
          <h3>Title: {content.title}</h3>
          <p>Content is being processed, try again later!</p>
        </div>
      </>
    );
  } else {
    return (
      <div style={{ margin: "20px" }}>
        {content && content.isProcessed && content.type === "quiz" && (
          <QuizDetails quiz={content} />
        )}
        {content && content.isProcessed && content.type !== "quiz" && (
          <StoryDetails type={content.type} story={content} />
        )}
      </div>
    );
  }
};

export default ContentDetails;
