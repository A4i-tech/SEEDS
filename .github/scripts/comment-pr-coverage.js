module.exports = async ({github, context}) => {
  const fs = require('fs');
  const coverageReport = fs.readFileSync('coverage_report.md', 'utf8');

  // Find existing coverage comment
  const comments = await github.rest.issues.listComments({
    owner: context.repo.owner,
    repo: context.repo.repo,
    issue_number: context.issue.number,
  });

  const existingComment = comments.data.find(comment =>
    comment.user.login === 'github-actions[bot]' &&
    comment.body.includes('📊 Test Coverage Report')
  );

  if (existingComment) {
    // Update existing comment
    await github.rest.issues.updateComment({
      owner: context.repo.owner,
      repo: context.repo.repo,
      comment_id: existingComment.id,
      body: coverageReport
    });
  } else {
    // Create new comment
    await github.rest.issues.createComment({
      owner: context.repo.owner,
      repo: context.repo.repo,
      issue_number: context.issue.number,
      body: coverageReport
    });
  }
};
