// @ts-check

class CallPage {
  constructor(page) {
    this.page = page;
    this.endCallButton = page.getByRole('button', { name: 'End Call' });
    this.endConferenceButton = page.getByRole('button', { name: 'End conference' });
    this.addParticipantButton = page.getByRole('button', { name: 'Add participant' });
    this.playContentButton = page.getByRole('button', { name: 'Play content' });
    this.muteAllButton = page.getByRole('button', { name: 'Mute all students' });
    this.unmuteAllButton = page.getByRole('button', { name: 'Unmute all students' });
    this.nowPlayingBanner = page.getByTestId('now-playing-banner');
  }

  participantCard(phoneNumber) {
    return this.page.locator(`[data-testid="participant-card"][data-phone="${phoneNumber}"]`);
  }

  async toggleMute(phoneNumber) {
    await this.participantCard(phoneNumber).getByRole('button', { name: /^Mute$|^Unmute$/ }).click();
  }

  async removeParticipant(phoneNumber) {
    await this.participantCard(phoneNumber).getByRole('button', { name: 'Remove participant' }).click();
    await this.page.getByRole('dialog').getByRole('button', { name: 'Remove' }).click();
  }

  async endConference() {
    await this.endConferenceButton.click();
  }

  async addParticipant(studentLabel) {
    await this.addParticipantButton.click();
    await this.page.getByRole('dialog').getByLabel(studentLabel).click();
    await this.page.getByRole('dialog').getByRole('button', { name: 'Submit' }).click();
  }

  async openContentDrawer() {
    await this.playContentButton.click();
  }
}

module.exports = { CallPage };
