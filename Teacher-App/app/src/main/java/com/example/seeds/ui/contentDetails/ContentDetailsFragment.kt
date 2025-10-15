package com.example.seeds.ui.contentDetails

import android.net.Uri
import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import androidx.fragment.app.viewModels
import androidx.navigation.fragment.navArgs
import com.example.seeds.databinding.FragmentContentDetailsBinding
import com.example.seeds.ui.BaseFragment
import com.google.android.exoplayer2.ExoPlayer
import com.google.android.exoplayer2.MediaItem
import dagger.hilt.android.AndroidEntryPoint

@AndroidEntryPoint
class ContentDetailsFragment : BaseFragment() {
    private var _binding: FragmentContentDetailsBinding? = null
    private val binding get() = _binding!!

    private val args: ContentDetailsFragmentArgs by navArgs()
    private val viewModel: ContentDetailsViewModel by viewModels()

    // Keep a separate player reference so we can safely release it
    private var player: ExoPlayer? = null

    override fun onCreateView(
        inflater: LayoutInflater, container: ViewGroup?,
        savedInstanceState: Bundle?
    ): View {
        // Inflate the layout for this fragment
        _binding = FragmentContentDetailsBinding.inflate(inflater, container, false)

        // Bind ViewModel & lifecycle owner
        binding.viewModel = viewModel
        binding.lifecycleOwner = viewLifecycleOwner

        // Set initial content from nav args (keeps behaviour identical to original)
        binding.content = args.content

        // Create player and attach to the PlayerView (contentAudio) as before
        player = ExoPlayer.Builder(requireContext()).build()
        binding.contentAudio.player = player

        observeViewModel()
        setupUiListeners()

        return binding.root
    }

    private fun observeViewModel() {
        // Observe SAS URL for playback
        viewModel.contentUrl.observe(viewLifecycleOwner) { url ->
            if (url != null) {
                logMessage("ContentSASURL: $url")
                val mediaItem = MediaItem.fromUri(Uri.parse(url))
                player?.apply {
                    try {
                        // Stop any current playback before setting new media
                        stop()
                    } catch (ignored: Exception) { }
                    setMediaItem(mediaItem)
                    prepare()
                }
            }
        }

        // Update UI when the current content changes
        viewModel.currentContent.observe(viewLifecycleOwner) { content ->
            // Update binding so UI reflects the new content (title, description etc.)
            binding.content = content
        }
    }

    private fun setupUiListeners() {
        binding.btnNextPage?.setOnClickListener {
            val moved = viewModel.loadNextContent()
            if (!moved) {
                showToast("No more pages")
            } else {
                showToast("Loading next...")
            }
        }
    }
    override fun onStart() {
        logMessage("onStart")
        super.onStart()
        // Keep same behaviour: refresh the content URL when fragment becomes visible
        viewModel.refreshContentUrl()
    }

    override fun onDestroyView() {
        // Log and release player safely (use viewModel.currentContent for IDs/titles to avoid binding after null)
        val current = viewModel.currentContent.value
        logMessage("Music player released ${current?.id} ${current?.title} ${player?.contentPosition} ${player?.contentDuration}")

        try {
            player?.stop()
        } catch (ignored: Exception) { }
        player?.release()
        player = null

        // Clear binding reference
        _binding = null

        super.onDestroyView()
    }

    override fun onStop() {
        logMessage("onStop")
        super.onStop()
    }
}