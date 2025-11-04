package com.example.seeds.ui.contentDetails

import android.net.Uri
import android.os.Bundle
import android.util.Log
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

    // Two ExoPlayers: one for main content, one for "answer" (if Riddle)
    private var mainPlayer: ExoPlayer? = null
    private var answerPlayer: ExoPlayer? = null

    override fun onCreateView(
        inflater: LayoutInflater, container: ViewGroup?,
        savedInstanceState: Bundle?
    ): View {
        _binding = FragmentContentDetailsBinding.inflate(inflater, container, false)
        binding.viewModel = viewModel
        binding.lifecycleOwner = viewLifecycleOwner
        binding.content = args.content

        // Initialize players
        mainPlayer = ExoPlayer.Builder(requireContext()).build()
        answerPlayer = ExoPlayer.Builder(requireContext()).build()

        // Attach to PlayerViews
        binding.contentAudio.player = mainPlayer
        binding.contentAudioAnswer.player = answerPlayer

        observeViewModel()
        setupUiListeners()

        return binding.root
    }

    private fun observeViewModel() {
        // Observe main content SAS URL
        viewModel.contentUrl.observe(viewLifecycleOwner) { url ->
            url?.let {
                logMessage("MainContentSASURL: $it")
                Log.d("SAS_URL", "Playing main content from URL: $it")
                playMedia(mainPlayer, it)
            }
        }
         // Observe answer (for riddles)
        // viewModel.answerUrl.observe(viewLifecycleOwner) { url ->
        //     url?.let {
        //         logMessage("AnswerSASURL: $it")
        //         playMedia(answerPlayer, it, autoPlay = false)
        //     }
        // }

        // Update content info
        viewModel.currentContent.observe(viewLifecycleOwner) { content ->
            binding.content = content
        }
    }

    private fun setupUiListeners() {
        binding.btnNextPage?.setOnClickListener {
            val moved = viewModel.loadNextContent()
            if (!moved) showToast("No more pages")
            else showToast("Loading next...")
        }
    }

    private fun playMedia(player: ExoPlayer?, url: String, autoPlay: Boolean = true) {
        val mediaItem = MediaItem.fromUri(Uri.parse(url))
        Log.d("SAS_URL", "Preparing media item: $mediaItem")
        player?.apply {
            try {
                stop()
            } catch (_: Exception) {}
            setMediaItem(mediaItem)
            prepare()
            playWhenReady = autoPlay
        }
    }

    override fun onStart() {
        super.onStart()
        logMessage("onStart")
        viewModel.refreshContentUrl()
    }

    override fun onStop() {
        logMessage("onStop")
        super.onStop()
        mainPlayer?.pause()
        answerPlayer?.pause()
    }

    override fun onDestroyView() {
        logMessage("Releasing ExoPlayers")

        try { mainPlayer?.stop() } catch (_: Exception) {}
        try { answerPlayer?.stop() } catch (_: Exception) {}

        mainPlayer?.release()
        answerPlayer?.release()
        mainPlayer = null
        answerPlayer = null

        _binding = null
        super.onDestroyView()
    }
}
